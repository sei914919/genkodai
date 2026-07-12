// 外部プロセス実行の唯一の入口（SPEC §5.8）。
//
// GUIアプリ（Finder/Dock起動）はシェルのPATHを継承しないため、外部バイナリは
// 生のコマンド名では呼ばない。必ず binPaths で解決したフルパスを渡すこと。
// plugin-shell のスコープは固定コマンドしか許可できないため、ログインシェル
// `<shell> -lc` を許可コマンドとし、その中でフルパスを実行する。
// 使うシェルは起動時に shell.ts が探索し（/bin/bash → /bin/zsh）、setActiveShell で
// ここへ注入する。capabilities/default.json には両シェルを allow 併記してある。
// 引数はシェル解釈を避けるため必ず単一引用符でクォートする。
import { Command } from "@tauri-apps/plugin-shell";
import { SHELL_CANDIDATES, type ShellInfo } from "./shell";

// 起動時に確定するシェル。未設定時は探索順の先頭（bash）を仮定する。
// name は capability の allow 名と一致していなければ Command.create が拒否される。
let activeShell: ShellInfo = SHELL_CANDIDATES[0];

export function setActiveShell(shell: ShellInfo): void {
  activeShell = shell;
}

export function getActiveShell(): ShellInfo {
  return activeShell;
}

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

// <shell> -lc に渡す生スクリプト（バイナリ解決など、シェル組み込みが要る場合のみ使う）
export async function runScript(script: string, cwd?: string): Promise<RunResult> {
  const cmd = Command.create(activeShell.name, ["-lc", script], cwd ? { cwd } : undefined);
  const out = await cmd.execute();
  return {
    code: out.code,
    stdout: out.stdout.trim(),
    stderr: out.stderr.trim(),
  };
}

// キャンセル可能な実行（FR16）。`exec` でシェルを実プロセスに置き換えるため、
// kill() が確実に対象バイナリへ届く。
export interface Spawned {
  kill: () => Promise<void>;
  result: Promise<RunResult>;
  pid: number;
}

export async function spawnProgram(
  programFullPath: string,
  args: string[],
  cwd?: string,
): Promise<Spawned> {
  const script = "exec " + [programFullPath, ...args].map(shq).join(" ");
  const cmd = Command.create(activeShell.name, ["-lc", script], cwd ? { cwd } : undefined);
  let stdout = "";
  let stderr = "";
  cmd.stdout.on("data", (d: string) => {
    stdout += d;
  });
  cmd.stderr.on("data", (d: string) => {
    stderr += d;
  });
  const result = new Promise<RunResult>((resolve, reject) => {
    cmd.on("close", (data: { code: number | null }) =>
      resolve({ code: data.code, stdout: stdout.trim(), stderr: stderr.trim() }),
    );
    cmd.on("error", (e: string) => reject(new Error(e)));
  });
  const child = await cmd.spawn();
  return { kill: () => child.kill(), result, pid: child.pid };
}
