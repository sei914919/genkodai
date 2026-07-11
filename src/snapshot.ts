// NFR3 リカバリスナップショット：プロジェクトを開いた時点の原稿を
// app config 領域の .genkodai-recovery/ に直近5世代まで保存する。
// プロジェクトフォルダには一切書かない（絶対規則4）。
import { appConfigDir } from "@tauri-apps/api/path";
import {
  exists,
  mkdir,
  readDir,
  readTextFile,
  remove,
  writeTextFile,
} from "@tauri-apps/plugin-fs";
import { contentHash, baseName } from "./fileio";

export const RECOVERY_DIR = ".genkodai-recovery";
export const KEEP_GENERATIONS = 5;

// 世代ディレクトリ名（辞書順＝時系列順になる形式）
export function generationName(d: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}` +
    `-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
  );
}

// 既存世代名から削除すべきものを返す（純粋関数）。新しい世代を追加した後に
// 呼ぶ想定で、辞書順の古い方から keep を超えた分を返す。
export function generationsToPrune(existing: string[], keep = KEEP_GENERATIONS): string[] {
  return [...existing].sort().slice(0, Math.max(0, existing.length - keep));
}

// 削除は必ずこのガードを通す：リカバリ領域の外は絶対に消さない。
// （本アプリにユーザーファイルの削除機能は存在しない — 絶対規則5。
//   ここで消すのはアプリ自身が作ったスナップショットの世代のみ）
async function removeRecoveryDir(path: string): Promise<void> {
  if (!path.includes(`/${RECOVERY_DIR}/`)) {
    throw new Error(`リカバリ領域外の削除を拒否しました: ${path}`);
  }
  await remove(path, { recursive: true });
}

// projectDir の原稿（ルートの *.qmd と refs.bib）をスナップショットする。
export async function snapshotProject(
  projectDir: string,
  qmdFiles: string[],
): Promise<string> {
  const cfg = await appConfigDir();
  const projKey = `${baseName(projectDir)}-${contentHash(projectDir).slice(0, 12)}`;
  const baseDir = `${cfg}/${RECOVERY_DIR}/${projKey}`;
  const genDir = `${baseDir}/${generationName()}`;
  await mkdir(genDir, { recursive: true });

  const targets = [...qmdFiles];
  const bib = `${projectDir}/refs.bib`;
  if (await exists(bib)) targets.push(bib);

  for (const src of targets) {
    const content = await readTextFile(src);
    await writeTextFile(`${genDir}/${baseName(src)}`, content);
  }

  // 世代ローテーション（直近 KEEP_GENERATIONS 世代を保持）
  const entries = await readDir(baseDir);
  const gens = entries.filter((e) => e.isDirectory).map((e) => e.name);
  for (const old of generationsToPrune(gens)) {
    await removeRecoveryDir(`${baseDir}/${old}`);
  }
  return genDir;
}
