import { useCallback, useEffect, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { openPath } from "@tauri-apps/plugin-opener";
import { Editor } from "./Editor";
import { LeftRail } from "./LeftRail";
import { RightPanel } from "./RightPanel";
import { SettingsDialog } from "./SettingsDialog";
import { NewProjectDialog } from "./NewProjectDialog";
import { baseName, listQmdFiles } from "./fileio";
import { loadResources } from "./loadProject";
import { forgetProject, loadRecent, rememberProject } from "./recentProjects";
import { insertRequireCitation } from "./editorActions";
import { fireAndReport } from "./async";
import { loadSettings, missingHint, resolveBins } from "./binPaths";
import { resolveShell } from "./shell";
import { setActiveShell } from "./runner";
import { gitCommitAll, gitState } from "./git";
import { integrityReport, renderQuarto } from "./workflow";
import { snapshotProject } from "./snapshot";
import { useAppStore } from "./store";
import styles from "./App.module.css";

const STATUS_LABEL = {
  clean: "保存済み",
  dirty: "未保存",
  saving: "保存中…",
} as const;

export default function App() {
  const projectDir = useAppStore((s) => s.projectDir);
  const qmdFiles = useAppStore((s) => s.qmdFiles);
  const currentPath = useAppStore((s) => s.currentPath);
  const saveStatus = useAppStore((s) => s.saveStatus);
  const notice = useAppStore((s) => s.notice);
  const recent = useAppStore((s) => s.recent);
  const charCount = useAppStore((s) => s.derived.charCount);
  const markerCount = useAppStore((s) => s.derived.markers.length);
  const view = useAppStore((s) => s.view);
  const bins = useAppStore((s) => s.bins);
  const git = useAppStore((s) => s.git);
  const render = useAppStore((s) => s.render);
  const openProject = useAppStore((s) => s.openProject);
  const setRecent = useAppStore((s) => s.setRecent);
  const setCurrentPath = useAppStore((s) => s.setCurrentPath);
  const setNotice = useAppStore((s) => s.setNotice);
  const setNotesData = useAppStore((s) => s.setNotesData);
  const setBins = useAppStore((s) => s.setBins);
  const setShell = useAppStore((s) => s.setShell);
  const setSettingsOpen = useAppStore((s) => s.setSettingsOpen);
  const setGit = useAppStore((s) => s.setGit);
  const setRender = useAppStore((s) => s.setRender);
  const setIntegrityReport = useAppStore((s) => s.setIntegrityReport);
  const setRightTab = useAppStore((s) => s.setRightTab);

  const [committing, setCommitting] = useState(false);
  const [newProjectOpen, setNewProjectOpen] = useState(false);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 5200);
    return () => clearTimeout(t);
  }, [notice, setNotice]);

  // FR2: 起動時に最近開いたプロジェクトを app config 領域から読み込む
  useEffect(() => {
    fireAndReport(loadRecent().then(setRecent), "最近のプロジェクト読込");
  }, [setRecent]);

  // §5.8-1: 起動時に一度だけ、まず実行シェルを探索（/bin/bash→/bin/zsh）してから
  // それを使って外部バイナリのフルパスを解決する。シェルが無ければ探索は失敗するが、
  // 設定ダイアログの手動絶対パス指定で救済できる（＝機能欠損の理由が可視化される）。
  useEffect(() => {
    (async () => {
      const shell = await resolveShell();
      if (shell) setActiveShell(shell);
      setShell(shell);
      const settings = await loadSettings();
      setBins(await resolveBins(settings), settings);
    })().catch((e) => setNotice(`パス解決に失敗しました: ${e}`));
  }, []);

  // FR8: Cmd/Ctrl+Shift+F で要出典マーカー挿入（CodeMirror の keymap には触れない）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.code === "KeyF") {
        e.preventDefault();
        insertRequireCitation(view);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [view]);

  // FR20: git 状態の更新（保存状態が変わるたびに取り直す）
  const refreshGit = useCallback(async () => {
    if (!projectDir || !bins.git) return;
    try {
      setGit(await gitState(bins.git, projectDir));
    } catch {
      /* git が使えない状況は表示側で「未解決」として扱う */
    }
  }, [projectDir, bins.git, setGit]);

  useEffect(() => {
    fireAndReport(refreshGit(), "git状態の取得");
  }, [refreshGit, saveStatus]);

  // フォルダを実際に読み込む共通処理（「フォルダを開く」と最近のプロジェクトから共用）。
  // 成功時に FR2 の履歴へ記録する。失敗は呼び出し側で扱う（履歴クリック時は掃除する）。
  const openFolder = useCallback(
    async (dir: string) => {
      const files = await listQmdFiles(dir);
      openProject(dir, files);
      const res = await loadResources(dir);
      setNotesData(res.notes, res.refs, res.bibErrors, res.orphanKeys);
      // NFR3: 開いた時点の原稿を app config 領域へスナップショット（直近5世代）
      fireAndReport(snapshotProject(dir, files), "リカバリスナップショット");
      // FR2: 履歴の先頭へ昇格
      setRecent(await rememberProject(dir));
    },
    [openProject, setNotesData, setRecent],
  );

  const chooseFolder = async () => {
    const dir = await open({ directory: true, title: "プロジェクトフォルダを開く" });
    if (typeof dir !== "string") return;
    try {
      await openFolder(dir);
    } catch (e) {
      setNotice(`フォルダを開けませんでした: ${e}`);
    }
  };

  // FR2: 履歴から開く。開けなければ（フォルダ移動・削除など）履歴から掃除する。
  const openRecent = async (dir: string) => {
    try {
      await openFolder(dir);
    } catch (e) {
      setRecent(await forgetProject(dir));
      setNotice(`開けませんでした（履歴から削除しました）: ${e}`);
    }
  };

  // FR19 整合チェック
  const runIntegrity = () => {
    const s = useAppStore.getState();
    setIntegrityReport(
      integrityReport({
        orphanKeys: s.orphanKeys,
        markerCount: s.derived.markers.length,
        unsaved: s.saveStatus !== "clean",
        bibErrors: s.bibErrors,
        noteFileCount: s.notes.length,
        refCount: s.refs.length,
      }),
    );
  };

  // FR18 レンダー：実行前リント（要出典が残っていれば中止）＋明示的な逃げ道
  const runRender = async (ignoreLint: boolean) => {
    const s = useAppStore.getState();
    if (!s.projectDir || !s.currentPath || !s.bins.quarto) return;
    if (!ignoreLint && s.derived.markers.length > 0) {
      setRender({
        running: false,
        ok: false,
        outputPath: null,
        log: `レンダーを中止しました：要出典が ${s.derived.markers.length} 件残っています（執筆環境v2 FR6）。\nドラフト出力が目的なら「警告を無視してレンダー」を押してください。`,
      });
      setNotice(`要出典が ${s.derived.markers.length} 件残っています`);
      return;
    }
    setRender({ running: true, ok: null, log: "quarto render を実行中…", outputPath: null });
    try {
      const out = await renderQuarto(s.bins.quarto, s.projectDir, s.currentPath);
      setRender({ running: false, ok: out.ok, log: out.log, outputPath: out.outputPath });
      setNotice(out.ok ? "レンダーに成功しました" : "レンダーに失敗しました");
    } catch (e) {
      setRender({ running: false, ok: false, log: String(e), outputPath: null });
    }
  };

  // FR18: 出力ファイルを既定アプリで開く。失敗を握りつぶすと「押しても何も起きない」に
  // なるため、必ず理由を表示する。
  const openOutput = async (path: string) => {
    try {
      await openPath(path);
    } catch (e) {
      setNotice(`出力を開けませんでした: ${e}`);
    }
  };

  // FR21: レンダー成功時の任意コミット
  const commitAfterRender = async () => {
    const s = useAppStore.getState();
    if (!s.projectDir || !s.bins.git || !s.git.isRepo || !s.currentPath) return;
    const r = await gitCommitAll(
      s.bins.git,
      s.projectDir,
      `render: ${baseName(s.currentPath)}`,
    );
    setNotice(r.committed ? `コミットしました: ${r.detail}` : r.detail);
    await refreshGit();
  };

  // FR20 手動コミット
  const commit = async () => {
    const s = useAppStore.getState();
    if (!s.projectDir || !s.bins.git || !s.git.isRepo) return;
    const message = window.prompt(
      "コミットメッセージ",
      `manual: ${new Date().toISOString().slice(0, 16).replace("T", " ")}`,
    );
    if (!message) return;
    setCommitting(true);
    try {
      const r = await gitCommitAll(s.bins.git, s.projectDir, message);
      setNotice(r.committed ? `コミットしました: ${r.detail}` : r.detail);
      await refreshGit();
    } catch (e) {
      setNotice(`コミットに失敗しました: ${e}`);
    } finally {
      setCommitting(false);
    }
  };

  const hasDoc = projectDir && qmdFiles.length > 0;
  const gitLabel = !bins.git
    ? "git 未解決"
    : !git.isRepo
      ? "gitリポジトリではありません"
      : `${git.branch} · ${git.dirty ? `${git.changedFiles}件の変更` : "clean"}`;

  return (
    <div className={styles.app}>
      <div className={styles.topbar}>
        <div className={styles.brand}>
          原稿台<span className={styles.brandSub}>GENKŌDAI</span>
        </div>
        {qmdFiles.map((f) => (
          <button
            key={f}
            className={f === currentPath ? styles.fileTabActive : styles.fileTab}
            onClick={() => setCurrentPath(f)}
          >
            {baseName(f)}
          </button>
        ))}
        {projectDir && (
          <span className={styles.status} data-status={saveStatus}>
            <span className={styles.statusDot} data-status={saveStatus} />
            {STATUS_LABEL[saveStatus]}
          </span>
        )}
        {projectDir && (
          <span
            className={styles.gitState}
            data-state={!bins.git ? "unresolved" : !git.isRepo ? "norepo" : git.dirty ? "dirty" : "clean"}
            title={
              !bins.git
                ? missingHint("git")
                : !git.isRepo
                  ? "このフォルダは git リポジトリではありません（ターミナルで git init すると版管理できます）"
                  : "ブランチと作業ツリーの状態"
            }
          >
            <span className={styles.gitDot} />
            {gitLabel}
          </span>
        )}
        {projectDir && git.isRepo && bins.git && (
          <button className={styles.openBtn} onClick={commit} disabled={committing || !git.dirty}>
            {committing ? "コミット中…" : "コミット"}
          </button>
        )}

        <div className={styles.spacer} />

        {hasDoc && (
          <>
            <span className={styles.count}>{charCount.toLocaleString()} 字</span>
            <span className={styles.markerBadge} data-open={markerCount > 0}>
              要出典 {markerCount}
            </span>
            <button className={styles.openBtn} onClick={runIntegrity}>
              整合チェック
            </button>
            <button
              className={styles.renderBtn}
              onClick={() => fireAndReport(runRender(false), "レンダー")}
              disabled={!bins.quarto || render.running}
              title={bins.quarto ? "quarto render を実行" : missingHint("quarto")}
            >
              {render.running ? "レンダー中…" : "レンダー"}
            </button>
          </>
        )}
        <button className={styles.openBtn} onClick={() => setNewProjectOpen(true)}>
          新規プロジェクト
        </button>
        <button
          className={styles.openBtn}
          onClick={() => setSettingsOpen(true)}
          title="外部コマンドのパス設定"
        >
          設定
        </button>
        <button className={styles.openBtn} onClick={chooseFolder}>
          フォルダを開く
        </button>
      </div>

      {!hasDoc ? (
        <div className={styles.center}>
          <div className={styles.welcome}>
            {!projectDir ? (
              <>
                <div className={styles.welcomeTitle}>原稿台</div>
                <p className={styles.welcomeText}>
                  執筆環境v2のプロジェクトフォルダ（paper.qmd / notes/ / refs.bib）を開いてください。
                </p>
                <div className={styles.welcomeActions}>
                  <button className={styles.openBtnLarge} onClick={chooseFolder}>
                    フォルダを開く
                  </button>
                  <button
                    className={styles.newBtnLarge}
                    onClick={() => setNewProjectOpen(true)}
                  >
                    新規プロジェクト
                  </button>
                </div>
                {recent.length > 0 && (
                  <div className={styles.recent}>
                    <div className={styles.recentLabel}>最近開いたプロジェクト</div>
                    {recent.map((r) => (
                      <button
                        key={r.dir}
                        className={styles.recentItem}
                        onClick={() => fireAndReport(openRecent(r.dir), "プロジェクトを開く")}
                        title={r.dir}
                      >
                        <span className={styles.recentName}>{r.name}</span>
                        <span className={styles.recentPath}>{r.dir}</span>
                      </button>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <p className={styles.welcomeText}>
                このフォルダに .qmd ファイルが見つかりません。
                <br />
                「フォルダを開く」からやり直すか、VSCode等で paper.qmd を作成後に開き直してください。
              </p>
            )}
          </div>
        </div>
      ) : (
        <div className={styles.workspace}>
          <LeftRail />
          <div className={styles.center}>
            <div className={styles.page}>
              <Editor />
            </div>
            <ReportPanel
              onOpenOutput={(p) => fireAndReport(openOutput(p), "出力を開く")}
              onIgnoreLint={() => fireAndReport(runRender(true), "レンダー")}
              onCommitRender={() => fireAndReport(commitAfterRender(), "コミット")}
              onCloseRender={() => setRender({ ok: null, log: "", outputPath: null })}
              onCloseIntegrity={() => setIntegrityReport(null)}
              onOpenRefs={() => setRightTab("refs")}
            />
          </div>
          <RightPanel />
        </div>
      )}

      <SettingsDialog />
      {newProjectOpen && <NewProjectDialog onClose={() => setNewProjectOpen(false)} />}
      {notice && <div className={styles.toast}>{notice}</div>}
    </div>
  );
}

// レンダー結果・整合チェック結果の表示（監査用。ファイルには書かない）
function ReportPanel({
  onOpenOutput,
  onIgnoreLint,
  onCloseRender,
  onCloseIntegrity,
  onOpenRefs,
  onCommitRender,
}: {
  onOpenOutput: (path: string) => void;
  onIgnoreLint: () => void;
  onCloseRender: () => void;
  onCloseIntegrity: () => void;
  onOpenRefs: () => void;
  onCommitRender: () => void;
}) {
  const render = useAppStore((s) => s.render);
  const report = useAppStore((s) => s.integrityReport);
  const orphanCount = useAppStore((s) => s.orphanKeys.length);
  const markerCount = useAppStore((s) => s.derived.markers.length);
  const git = useAppStore((s) => s.git);

  const showRender = render.log !== "";
  if (!showRender && report === null) return null;

  return (
    <div className={styles.reports}>
      {report !== null && (
        <div className={styles.report}>
          <div className={styles.reportHead}>
            <span className={styles.reportTitle}>整合チェック</span>
            <button className={styles.reportClose} onClick={onCloseIntegrity}>
              閉じる
            </button>
          </div>
          <pre className={styles.reportBody}>{report}</pre>
          {orphanCount > 0 && (
            <button className={styles.reportAction} onClick={onOpenRefs}>
              文献タブで孤児キーを見る
            </button>
          )}
        </div>
      )}

      {showRender && (
        <div className={styles.report} data-ok={render.ok === true} data-ng={render.ok === false}>
          <div className={styles.reportHead}>
            <span className={styles.reportTitle}>
              レンダー
              {render.ok === true && " — 成功"}
              {render.ok === false && " — 失敗/中止"}
            </span>
            <button className={styles.reportClose} onClick={onCloseRender}>
              閉じる
            </button>
          </div>
          <pre className={styles.reportBody}>{render.log}</pre>
          <div className={styles.reportActions}>
            {render.ok === true && render.outputPath && (
              <button
                className={styles.reportAction}
                onClick={() => onOpenOutput(render.outputPath!)}
              >
                出力を開く
              </button>
            )}
            {render.ok === true && git.isRepo && git.dirty && (
              <button className={styles.reportAction} onClick={onCommitRender}>
                この状態をコミット（FR21）
              </button>
            )}
            {render.ok === false && markerCount > 0 && !render.running && (
              <button className={styles.reportActionShu} onClick={onIgnoreLint}>
                警告を無視してレンダー
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
