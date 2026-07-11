// 外部バイナリのパス解決（SPEC §5.8）。
// 1. 起動時に `/bin/zsh -lc` で claude/quarto/git のフルパスを取得しメモリ保持
// 2. 解決失敗分は設定ダイアログで絶対パスを手動指定（Tauri app config 領域に保存）
// 3. 未解決バイナリに依存する機能はUIで無効化＋案内（呼び出し側の責務）
//
// 保存先は app config 領域のみ。プロジェクトフォルダには一切書かない（絶対規則4）。
import { appConfigDir } from "@tauri-apps/api/path";
import { exists, mkdir, readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { runScript, shq } from "./runner";

export const BIN_NAMES = ["claude", "quarto", "git"] as const;
export type BinName = (typeof BIN_NAMES)[number];

export type BinPaths = Record<BinName, string | null>;

export interface Settings {
  // ユーザーが手動指定した絶対パス（自動解決より優先）
  manualPaths: Partial<Record<BinName, string>>;
}

const SETTINGS_FILE = "settings.json";

async function settingsPath(): Promise<string> {
  const dir = await appConfigDir();
  if (!(await exists(dir))) await mkdir(dir, { recursive: true });
  return `${dir}/${SETTINGS_FILE}`;
}

export async function loadSettings(): Promise<Settings> {
  try {
    const p = await settingsPath();
    if (!(await exists(p))) return { manualPaths: {} };
    const parsed = JSON.parse(await readTextFile(p)) as Partial<Settings>;
    return { manualPaths: parsed.manualPaths ?? {} };
  } catch {
    return { manualPaths: {} };
  }
}

export async function saveSettings(s: Settings): Promise<void> {
  await writeTextFile(await settingsPath(), JSON.stringify(s, null, 2));
}

// --- 解決スクリプトと、その出力のパース（純粋関数：ユニットテスト対象） ---

// 各行を `<名前>\t<パス>` のラベル付きで出力する。未解決なら パスが空文字。
// 位置依存のパースは禁止：空行が詰まる／trimされると名前とパスがズレるため
// （実際に quarto に git のパスが割り当たる不具合を起こした）。
export function resolveScript(names: readonly string[] = BIN_NAMES): string {
  return names
    .map((n) => `printf '%s\\t%s\\n' ${n} "$(command -v ${n} 2>/dev/null || true)"`)
    .join("; ");
}

// 解決済みパスの妥当性：絶対パスであり、ファイル名がコマンド名を含むこと。
// （`quarto` の解決結果が `/usr/bin/git` のような取り違えを機械的に弾く）
export function isPlausiblePath(name: string, path: string): boolean {
  if (!path.startsWith("/")) return false;
  const base = path.split("/").pop() ?? "";
  return base.toLowerCase().includes(name.toLowerCase());
}

// ラベル付き出力をパースする。行の順序・欠落・空行に依存しない。
export function parseResolveOutput(stdout: string): Partial<Record<BinName, string>> {
  const out: Partial<Record<BinName, string>> = {};
  for (const line of stdout.split("\n")) {
    const tab = line.indexOf("\t");
    if (tab === -1) continue;
    const name = line.slice(0, tab).trim() as BinName;
    const path = line.slice(tab + 1).trim();
    if (!(BIN_NAMES as readonly string[]).includes(name)) continue;
    if (path === "" || !isPlausiblePath(name, path)) continue;
    out[name] = path;
  }
  return out;
}

// 手動指定 > 自動解決。実行可能かつ名前が妥当なものだけを採用する。
export async function resolveBins(settings: Settings): Promise<BinPaths> {
  let auto: Partial<Record<BinName, string>> = {};
  try {
    const res = await runScript(resolveScript());
    auto = parseResolveOutput(res.stdout);
  } catch {
    auto = {};
  }

  const resolved = {} as BinPaths;
  for (const name of BIN_NAMES) {
    const manual = settings.manualPaths[name]?.trim();
    if (manual) {
      // 手動指定にも妥当性検証をかける（過去の誤った値が保存されていても自己修復する）
      resolved[name] =
        isPlausiblePath(name, manual) && (await isExecutable(manual)) ? manual : null;
      continue;
    }
    resolved[name] = auto[name] ?? null;
  }
  return resolved;
}

export async function isExecutable(path: string): Promise<boolean> {
  try {
    const out = await runScript(`test -x ${shq(path)} && echo ok`);
    return out.stdout.trim() === "ok";
  } catch {
    return false;
  }
}

export function missingHint(name: BinName): string {
  return `${name} が見つかりません。設定でパスを指定してください`;
}
