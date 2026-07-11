// git 表示・手動コミット（FR20 / v2-NFR7）。git は必ず §5.8 で解決したフルパスで呼ぶ。
import { runProgram } from "./runner";

export interface GitState {
  isRepo: boolean;
  branch: string | null;
  dirty: boolean;
  changedFiles: number;
}

export const NOT_A_REPO: GitState = {
  isRepo: false,
  branch: null,
  dirty: false,
  changedFiles: 0,
};

export async function gitState(gitPath: string, dir: string): Promise<GitState> {
  const inside = await runProgram(gitPath, ["rev-parse", "--is-inside-work-tree"], dir);
  if (inside.code !== 0 || inside.stdout !== "true") return NOT_A_REPO;

  const branchOut = await runProgram(gitPath, ["branch", "--show-current"], dir);
  const statusOut = await runProgram(gitPath, ["status", "--porcelain"], dir);
  const lines = statusOut.stdout.split("\n").filter((l) => l.trim() !== "");
  return {
    isRepo: true,
    branch: branchOut.stdout || "(detached)",
    dirty: lines.length > 0,
    changedFiles: lines.length,
  };
}

// ワークツリー全体をコミットする（FR16のpre-fillと同じ意図：監査点を丸ごと固定する）。
// 変更が無ければ commit せず false を返す。
export async function gitCommitAll(
  gitPath: string,
  dir: string,
  message: string,
): Promise<{ committed: boolean; detail: string }> {
  const add = await runProgram(gitPath, ["add", "-A"], dir);
  if (add.code !== 0) return { committed: false, detail: add.stderr || "git add に失敗" };

  const staged = await runProgram(gitPath, ["diff", "--cached", "--name-only"], dir);
  if (staged.stdout === "") return { committed: false, detail: "コミットする変更がありません" };

  const commit = await runProgram(gitPath, ["commit", "-m", message], dir);
  if (commit.code !== 0) {
    return { committed: false, detail: commit.stderr || commit.stdout || "git commit に失敗" };
  }
  return { committed: true, detail: commit.stdout.split("\n")[0] ?? "" };
}
