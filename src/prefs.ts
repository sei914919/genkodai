// UI 表示設定（ズーム倍率など）の永続化。
//
// 保存先は app config 領域の prefs.json のみ。プロジェクトフォルダには一切書かない
// （絶対規則4）。settings.json（binPaths）や recent.json とは別ファイルにして、
// 互いを上書きしないようにする（recentProjects.ts と同じ方針）。
import { appConfigDir } from "@tauri-apps/api/path";
import { exists, mkdir, readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { clampZoom, REF_SIDE_DEFAULT, ZOOM_DEFAULT, type RefSide } from "./store";

export interface Prefs {
  zoom: number; // 原稿テキストのズーム倍率
  refSide: RefSide; // FR25: 参照ペインの配置（左/右）
}

const PREFS_FILE = "prefs.json";

async function prefsPath(): Promise<string> {
  const dir = await appConfigDir();
  if (!(await exists(dir))) await mkdir(dir, { recursive: true });
  return `${dir}/${PREFS_FILE}`;
}

export async function loadPrefs(): Promise<Prefs> {
  try {
    const p = await prefsPath();
    if (!(await exists(p))) return { zoom: ZOOM_DEFAULT, refSide: REF_SIDE_DEFAULT };
    const parsed = JSON.parse(await readTextFile(p)) as Partial<Prefs>;
    return {
      zoom: clampZoom(parsed.zoom ?? ZOOM_DEFAULT),
      refSide: parsed.refSide === "right" ? "right" : REF_SIDE_DEFAULT,
    };
  } catch {
    // 壊れた設定ファイルで起動を妨げない。既定として扱う。
    return { zoom: ZOOM_DEFAULT, refSide: REF_SIDE_DEFAULT };
  }
}

export async function savePrefs(prefs: Prefs): Promise<void> {
  await writeTextFile(await prefsPath(), JSON.stringify(prefs, null, 2));
}
