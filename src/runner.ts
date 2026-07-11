// 外部プロセス実行の唯一の入口（SPEC §5.8）。
//
// GUIアプリ（Finder/Dock起動）はシェルのPATHを継承しないため、外部バイナリは
// 生のコマンド名では呼ばない。必ず binPaths で解決したフルパスを渡すこと。
// plugin-shell のスコープは固定コマンドしか許可できないため、ログインシェル
// `/bin/zsh -lc` を唯一の許可コマンドとし、その中でフルパスを実行する。
// 引数はシェル解釈を避けるため必ず単一引用符でクォートする。
import { Command } from "@tauri-apps/plugin-shell";

export interface RunResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

// シェル単一引用符クォート（パスに空白・記号が含まれても安全に渡す）
export function shq(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

// フルパスのプログラムを引数付きで実行する。cwd 未指定ならホーム。
export async function runProgram(
  programFullPath: string,
  args: string[],
  cwd?: string,
): Promise<RunResult> {
  const script = [programFullPath, ...args].map(shq).join(" ");
  return runScript(script, cwd);
}

// zsh -lc に渡す生スクリプト（バイナリ解決など、シェル組み込みが要る場合のみ使う）
export async function runScript(script: string, cwd?: string): Promise<RunResult> {
  const cmd = Command.create("zsh", ["-lc", script], cwd ? { cwd } : undefined);
  const out = await cmd.execute();
  return {
    code: out.code,
    stdout: out.stdout.trim(),
    stderr: out.stderr.trim(),
  };
}
