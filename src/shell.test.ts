import { describe, expect, it } from "vitest";
import { pickShell, SHELL_CANDIDATES, type ShellInfo } from "./shell";

// 存在するパスの集合から existsFn を作る（実ファイルシステムに触れない）。
function existsFrom(present: string[]) {
  return async (p: string) => present.includes(p);
}

describe("SHELL_CANDIDATES", () => {
  it("bash を先に、zsh を後に探索する（フォールバック順）", () => {
    expect(SHELL_CANDIDATES.map((s) => s.path)).toEqual(["/bin/bash", "/bin/zsh"]);
  });

  it("name は Command.create 用、path は絶対パス", () => {
    for (const s of SHELL_CANDIDATES) {
      expect(s.path.startsWith("/")).toBe(true);
      expect(s.name).not.toBe("");
    }
  });
});

describe("pickShell", () => {
  it("bash と zsh の両方があれば bash を選ぶ（先頭優先）", async () => {
    const s = await pickShell(existsFrom(["/bin/bash", "/bin/zsh"]));
    expect(s).toEqual({ name: "bash", path: "/bin/bash" });
  });

  it("bash が無く zsh だけあれば zsh にフォールバックする", async () => {
    const s = await pickShell(existsFrom(["/bin/zsh"]));
    expect(s).toEqual({ name: "zsh", path: "/bin/zsh" });
  });

  it("bash だけあれば bash", async () => {
    const s = await pickShell(existsFrom(["/bin/bash"]));
    expect(s).toEqual({ name: "bash", path: "/bin/bash" });
  });

  it("どちらも無ければ null", async () => {
    const s = await pickShell(existsFrom([]));
    expect(s).toBeNull();
  });

  it("存在確認が例外を投げても次の候補へフォールバックする", async () => {
    const existsFn = async (p: string) => {
      if (p === "/bin/bash") throw new Error("permission denied");
      return p === "/bin/zsh";
    };
    const s = await pickShell(existsFn);
    expect(s).toEqual({ name: "zsh", path: "/bin/zsh" });
  });

  it("候補リストは差し替え可能（探索順を明示できる）", async () => {
    const candidates: ShellInfo[] = [
      { name: "zsh", path: "/bin/zsh" },
      { name: "bash", path: "/bin/bash" },
    ];
    const s = await pickShell(existsFrom(["/bin/bash", "/bin/zsh"]), candidates);
    expect(s).toEqual({ name: "zsh", path: "/bin/zsh" });
  });
});
