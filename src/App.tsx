import { useEffect } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { Editor } from "./Editor";
import { baseName, listQmdFiles } from "./fileio";
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
  const openProject = useAppStore((s) => s.openProject);
  const setCurrentPath = useAppStore((s) => s.setCurrentPath);
  const setNotice = useAppStore((s) => s.setNotice);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 4200);
    return () => clearTimeout(t);
  }, [notice, setNotice]);

  const chooseFolder = async () => {
    const dir = await open({ directory: true, title: "プロジェクトフォルダを開く" });
    if (typeof dir !== "string") return;
    try {
      openProject(dir, await listQmdFiles(dir));
    } catch (e) {
      setNotice(`フォルダを開けませんでした: ${e}`);
    }
  };

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
        <button className={styles.openBtn} onClick={chooseFolder}>
          フォルダを開く
        </button>
      </div>

      <div className={styles.center}>
        {!projectDir ? (
          <div className={styles.welcome}>
            <div className={styles.welcomeTitle}>原稿台</div>
            <p className={styles.welcomeText}>
              執筆環境v2のプロジェクトフォルダ（paper.qmd / notes/ / refs.bib）を開いてください。
            </p>
            <button className={styles.openBtnLarge} onClick={chooseFolder}>
              フォルダを開く
            </button>
          </div>
        ) : qmdFiles.length === 0 ? (
          <div className={styles.welcome}>
            <p className={styles.welcomeText}>
              このフォルダに .qmd ファイルが見つかりません。
              <br />
              「フォルダを開く」からやり直すか、VSCode等で paper.qmd を作成後に開き直してください。
            </p>
          </div>
        ) : (
          <div className={styles.page}>
            <Editor />
          </div>
        )}
      </div>

      {notice && <div className={styles.toast}>{notice}</div>}
    </div>
  );
}
