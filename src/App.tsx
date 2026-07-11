import { useEffect } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { Editor } from "./Editor";
import { LeftRail } from "./LeftRail";
import { RightPanel } from "./RightPanel";
import { baseName, listQmdFiles } from "./fileio";
import { loadResources } from "./loadProject";
import { insertRequireCitation } from "./editorActions";
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
  const charCount = useAppStore((s) => s.derived.charCount);
  const markerCount = useAppStore((s) => s.derived.markers.length);
  const view = useAppStore((s) => s.view);
  const openProject = useAppStore((s) => s.openProject);
  const setCurrentPath = useAppStore((s) => s.setCurrentPath);
  const setNotice = useAppStore((s) => s.setNotice);
  const setNotesData = useAppStore((s) => s.setNotesData);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 4200);
    return () => clearTimeout(t);
  }, [notice, setNotice]);

  // FR8: Cmd+Shift+F で要出典マーカー挿入。CodeMirror の keymap には触れず
  // window レベルで捕捉して共有 view に作用させる（IME安定性への配慮）。
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

  const chooseFolder = async () => {
    const dir = await open({ directory: true, title: "プロジェクトフォルダを開く" });
    if (typeof dir !== "string") return;
    try {
      openProject(dir, await listQmdFiles(dir));
      const res = await loadResources(dir);
      setNotesData(res.notes, res.refs, res.bibErrors, res.orphanKeys);
    } catch (e) {
      setNotice(`フォルダを開けませんでした: ${e}`);
    }
  };

  const hasDoc = projectDir && qmdFiles.length > 0;

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
        <div className={styles.spacer} />
        {hasDoc && (
          <>
            <span className={styles.count}>{charCount.toLocaleString()} 字</span>
            <span
              className={styles.markerBadge}
              data-open={markerCount > 0}
            >
              要出典 {markerCount}
            </span>
          </>
        )}
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
                <button className={styles.openBtnLarge} onClick={chooseFolder}>
                  フォルダを開く
                </button>
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
          </div>
          <RightPanel />
        </div>
      )}

      {notice && <div className={styles.toast}>{notice}</div>}
    </div>
  );
}
