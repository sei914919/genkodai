// 外部プロセス実行に使うログインシェルの探索（SPEC §5.8、クロスプラットフォーム）。
//
// OS判定ではなく「シェル自体の実在」で選ぶ。/bin/bash → /bin/zsh の順に確認し、
// 最初に見つかったものを使う。macOS の既定は zsh、多くの Linux は bash だが、
// どちらのOSでも両方あり得るため存在確認で吸収する。macOS 同梱の bash 3.2 でも
// 現行スクリプト（command -v / 単一引用符クォート / exec）は同一挙動なので、
// bash を優先しても mac 側の解決結果は変わらない。
//
// どちらも無ければ null。呼び出し側は「利用可能なシェルが無い」ことを明示し、
// 設定ダイアログの手動パス指定へ誘導する（バイナリ解決は不能になるが、
// 手動絶対パス指定なら実行自体は各バイナリの capability を通れば可能）。
import { exists } from "@tauri-apps/plugin-fs";

export interface ShellInfo {
  // Command.create の第一引数。capabilities/default.json の allow 名と一致させる。
  name: string;
  // 実際に起動される絶対パス。capability の cmd と一致させる。
  path: string;
}

// 探索順（先頭優先）。capabilities/default.json の shell:allow-* と1対1で対応させること。
export const SHELL_CANDIDATES: readonly ShellInfo[] = [
  { name: "bash", path: "/bin/bash" },
  { name: "zsh", path: "/bin/zsh" },
] as const;

// 純粋・テスト可能：存在判定関数を差し込み、最初に存在する候補を返す。
// 存在確認自体が例外を投げても（権限等）、次の候補へフォールバックする。
export async function pickShell(
  existsFn: (path: string) => Promise<boolean>,
  candidates: readonly ShellInfo[] = SHELL_CANDIDATES,
): Promise<ShellInfo | null> {
  for (const c of candidates) {
    try {
      if (await existsFn(c.path)) return c;
    } catch {
      /* この候補の確認に失敗したら次へ */
    }
  }
  return null;
}

// 実際の探索（plugin-fs 経由）。起動時に一度だけ呼ぶ。
export function resolveShell(): Promise<ShellInfo | null> {
  return pickShell((p) => exists(p));
}
