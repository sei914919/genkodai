// FR2: 最近開いたプロジェクトの記憶。
//
// 保存先は app config 領域の recent.json のみ。プロジェクトフォルダには一切書かない
// （絶対規則4）。OS 依存はない（appConfigDir + plugin-fs だけで完結し、binPaths.ts の
// loadSettings/saveSettings と同じパターン）。settings.json とは別ファイルにして、
// バイナリ設定と履歴が互いを上書きしないようにする。
import { appConfigDir } from "@tauri-apps/api/path";
import { exists, mkdir, readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { baseName } from "./fileio";

export interface RecentProject {
  dir: string; // プロジェクトフォルダの絶対パス
  name: string; // 表示名（フォルダ名）
  openedAt: string; // ISO8601。最終オープン時刻
}

export const MAX_RECENT = 8;
const RECENT_FILE = "recent.json";

async function recentPath(): Promise<string> {
  const dir = await appConfigDir();
  if (!(await exists(dir))) await mkdir(dir, { recursive: true });
  return `${dir}/${RECENT_FILE}`;
}

function isRecent(v: unknown): v is RecentProject {
  return (
    typeof v === "object" &&
    v !== null &&
    typeof (v as RecentProject).dir === "string" &&
    typeof (v as RecentProject).name === "string"
  );
}

// --- 純粋関数（ユニットテスト対象） ---

// dir を先頭へ昇格し、同一 dir の重複を除去、上限 max 件に丸めた新リストを返す。
export function promote(
  list: RecentProject[],
  entry: RecentProject,
  max = MAX_RECENT,
): RecentProject[] {
  const rest = list.filter((r) => r.dir !== entry.dir);
  return [entry, ...rest].slice(0, Math.max(0, max));
}

// dir をリストから除く（開けなかった履歴の掃除に使う）。
export function forget(list: RecentProject[], dir: string): RecentProject[] {
  return list.filter((r) => r.dir !== dir);
}

// --- 永続化 ---

export async function loadRecent(): Promise<RecentProject[]> {
  try {
    const p = await recentPath();
    if (!(await exists(p))) return [];
    const parsed = JSON.parse(await readTextFile(p)) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isRecent);
  } catch {
    // 壊れた履歴ファイルで起動を妨げない。空履歴として扱う。
    return [];
  }
}

async function saveRecent(list: RecentProject[]): Promise<void> {
  await writeTextFile(await recentPath(), JSON.stringify(list, null, 2));
}

// プロジェクトを開いた記録を残し、更新後のリストを返す。
export async function rememberProject(dir: string): Promise<RecentProject[]> {
  const entry: RecentProject = {
    dir,
    name: baseName(dir),
    openedAt: new Date().toISOString(),
  };
  const list = promote(await loadRecent(), entry);
  await saveRecent(list);
  return list;
}

// 開けなかった等の理由で履歴から除き、更新後のリストを返す。
export async function forgetProject(dir: string): Promise<RecentProject[]> {
  const list = forget(await loadRecent(), dir);
  await saveRecent(list);
  return list;
}
