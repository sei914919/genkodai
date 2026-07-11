// 新規プロジェクト作成（Phase 4a）。保存先＋名前 → テンプレート複製 → git init → そのまま開く。
import { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { createProject, ensureTemplate, readTemplate, validateProjectName } from "./templates";
import { gitInitAndCommit } from "./git";
import { listQmdFiles } from "./fileio";
import { loadResources } from "./loadProject";
import { snapshotProject } from "./snapshot";
import { fireAndReport } from "./async";
import { useAppStore } from "./store";
import styles from "./NewProjectDialog.module.css";

export function NewProjectDialog({ onClose }: { onClose: () => void }) {
  const bins = useAppStore((s) => s.bins);
  const openProject = useAppStore((s) => s.openProject);
  const setNotesData = useAppStore((s) => s.setNotesData);
  const setNotice = useAppStore((s) => s.setNotice);

  const [parentDir, setParentDir] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nameCheck = validateProjectName(name);
  const canCreate = parentDir !== null && nameCheck.ok && !busy;

  const chooseParent = async () => {
    const dir = await open({ directory: true, title: "保存先フォルダを選択" });
    if (typeof dir === "string") setParentDir(dir);
  };

  const create = async () => {
    if (parentDir === null) return;
    setBusy(true);
    setError(null);
    try {
      const template = await readTemplate(await ensureTemplate());
      const { projectDir } = await createProject(parentDir, name, template);

      // git init ＋ 初回コミット。未解決・失敗はエラーにせず案内する。
      let gitNote = "git が未解決のため版管理は未開始です（設定でパスを指定できます）";
      if (bins.git) {
        const r = await gitInitAndCommit(bins.git, projectDir, "init: project scaffold");
        gitNote = r.ok ? "git リポジトリを初期化しました" : `git 初期化をスキップ: ${r.detail}`;
      }

      // そのまま開く
      const files = await listQmdFiles(projectDir);
      openProject(projectDir, files);
      const res = await loadResources(projectDir);
      setNotesData(res.notes, res.refs, res.bibErrors, res.orphanKeys);
      fireAndReport(snapshotProject(projectDir, files), "リカバリスナップショット");

      setNotice(`「${name.trim()}」を作成して開きました。${gitNote}`);
      onClose();
    } catch (e) {
      setError(`${e instanceof Error ? e.message : e}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.backdrop} onClick={() => !busy && onClose()}>
      <div className={styles.dialog} onClick={(e) => e.stopPropagation()}>
        <div className={styles.title}>新規プロジェクト</div>
        <p className={styles.desc}>
          執筆環境v2の構造（paper.qmd / notes/ / refs.bib / CLAUDE.md）を作成します。
          雛形は設定の「テンプレート」を直接編集して育てられます。
        </p>

        <div className={styles.field}>
          <div className={styles.label}>保存先</div>
          <div className={styles.row}>
            <div className={styles.path}>{parentDir ?? "未選択"}</div>
            <button className={styles.pick} onClick={() => fireAndReport(chooseParent(), "フォルダ選択")}>
              選択
            </button>
          </div>
        </div>

        <div className={styles.field}>
          <div className={styles.label}>プロジェクト名</div>
          <input
            className={styles.input}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="self-preferencing-paper"
            spellCheck={false}
            autoFocus
          />
          {name !== "" && !nameCheck.ok && (
            <div className={styles.fieldError}>{nameCheck.reason}</div>
          )}
          {parentDir !== null && nameCheck.ok && (
            <div className={styles.preview}>
              {parentDir}/{name.trim()}
            </div>
          )}
        </div>

        {error && <div className={styles.error}>{error}</div>}

        <div className={styles.actions}>
          <button className={styles.cancel} onClick={onClose} disabled={busy}>
            閉じる
          </button>
          <button
            className={styles.create}
            onClick={() => fireAndReport(create(), "プロジェクト作成")}
            disabled={!canCreate}
          >
            {busy ? "作成中…" : "作成して開く"}
          </button>
        </div>
      </div>
    </div>
  );
}
