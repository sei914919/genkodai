// 外部バイナリのパス解決（SPEC §5.8）。
// 1. 起動時に `/bin/zsh -lc 'command -v <name>'` でフルパスを取得しメモリ保持
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

// 手動指定 > 自動解決。実行可能であることまで確認する。
export async function resolveBins(settings: Settings): Promise<BinPaths> {
  const resolved = {} as BinPaths;
  // 1回の zsh 起動でまとめて解決する（ログインシェル起動は遅いため）
  const script = BIN_NAMES.map((n) => `command -v ${n} || echo ''`).join("; ");
  let lines: string[] = [];
  try {
    const out = await runScript(script);
    lines = out.stdout.split("\n");
  } catch {
    lines = [];
  }

  for (let i = 0; i < BIN_NAMES.length; i++) {
    const name = BIN_NAMES[i];
    const manual = settings.manualPaths[name]?.trim();
    if (manual) {
      resolved[name] = (await isExecutable(manual)) ? manual : null;
      continue;
    }
    const auto = (lines[i] ?? "").trim();
    resolved[name] = auto.startsWith("/") ? auto : null;
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
