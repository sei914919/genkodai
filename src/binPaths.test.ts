import { describe, expect, it } from "vitest";
import { isPlausiblePath, parseResolveOutput, resolveScript } from "./binPaths";

describe("resolveScript", () => {
  it("各コマンドを名前ラベル付きで出力する（位置依存にしない）", () => {
    const s = resolveScript(["claude", "quarto", "git"]);
    expect(s).toContain("command -v claude");
    expect(s).toContain("command -v quarto");
    expect(s).toContain("command -v git");
    expect(s).toContain("printf");
  });
});

describe("parseResolveOutput", () => {
  it("3つとも解決できる場合", () => {
    const out = parseResolveOutput(
      [
        "claude\t/Users/sei/.local/bin/claude",
        "quarto\t/usr/local/bin/quarto",
        "git\t/usr/bin/git",
      ].join("\n"),
    );
    expect(out).toEqual({
      claude: "/Users/sei/.local/bin/claude",
      quarto: "/usr/local/bin/quarto",
      git: "/usr/bin/git",
    });
  });

  // 回帰テスト：この行ズレが「quarto として git が起動する」不具合の原因だった。
  it("先頭のコマンドだけ未解決でも、以降がズレない", () => {
    const out = parseResolveOutput(
      ["claude\t", "quarto\t/usr/local/bin/quarto", "git\t/usr/bin/git"].join("\n"),
    );
    expect(out.claude).toBeUndefined();
    expect(out.quarto).toBe("/usr/local/bin/quarto");
    expect(out.git).toBe("/usr/bin/git");
  });

  it("中央のコマンドだけ未解決でも、以降がズレない", () => {
    const out = parseResolveOutput(
      ["claude\t/Users/sei/.local/bin/claude", "quarto\t", "git\t/usr/bin/git"].join("\n"),
    );
    expect(out.claude).toBe("/Users/sei/.local/bin/claude");
    expect(out.quarto).toBeUndefined();
    expect(out.git).toBe("/usr/bin/git");
  });

  it("3つとも未解決なら空", () => {
    const out = parseResolveOutput(["claude\t", "quarto\t", "git\t"].join("\n"));
    expect(out).toEqual({});
  });

  it("前後に空行やノイズ行があっても壊れない", () => {
    const out = parseResolveOutput(
      ["", "some shell noise", "quarto\t/usr/local/bin/quarto", ""].join("\n"),
    );
    expect(out).toEqual({ quarto: "/usr/local/bin/quarto" });
  });

  it("名前とファイル名が食い違う値は採用しない（取り違えガード）", () => {
    const out = parseResolveOutput("quarto\t/usr/bin/git");
    expect(out.quarto).toBeUndefined();
  });
});

describe("isPlausiblePath", () => {
  it("コマンド名を含む絶対パスのみ妥当", () => {
    expect(isPlausiblePath("quarto", "/usr/local/bin/quarto")).toBe(true);
    expect(isPlausiblePath("git", "/usr/bin/git")).toBe(true);
    expect(isPlausiblePath("claude", "/Users/sei/.local/bin/claude")).toBe(true);
  });

  it("別のコマンドのパスは弾く", () => {
    expect(isPlausiblePath("quarto", "/usr/bin/git")).toBe(false);
    expect(isPlausiblePath("claude", "/usr/local/bin/quarto")).toBe(false);
  });

  it("相対パスは弾く", () => {
    expect(isPlausiblePath("quarto", "quarto")).toBe(false);
  });
});
