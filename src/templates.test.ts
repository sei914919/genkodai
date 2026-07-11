import { describe, expect, it } from "vitest";
import { BUILTIN_TEMPLATE, projectPath, validateProjectName } from "./templates";

describe("validateProjectName", () => {
  it("通常の名前を受け入れる（日本語・空白含む）", () => {
    expect(validateProjectName("self-preferencing-paper").ok).toBe(true);
    expect(validateProjectName("自己優遇 論文2026").ok).toBe(true);
  });

  it("空・空白のみは拒否する", () => {
    expect(validateProjectName("").ok).toBe(false);
    expect(validateProjectName("   ").ok).toBe(false);
  });

  it("パス区切りを拒否する（親フォルダ外への生成を防ぐ）", () => {
    expect(validateProjectName("a/b").ok).toBe(false);
    expect(validateProjectName("a\\b").ok).toBe(false);
  });

  it("上位参照・先頭ドットを拒否する", () => {
    expect(validateProjectName("..").ok).toBe(false);
    expect(validateProjectName(".").ok).toBe(false);
    expect(validateProjectName(".hidden").ok).toBe(false);
  });

  it("拒否理由を返す", () => {
    expect(validateProjectName("a/b").reason).toContain("パス区切り");
  });
});

describe("projectPath", () => {
  it("親フォルダと名前を結合し、末尾スラッシュと前後空白を吸収する", () => {
    expect(projectPath("/Users/sei/papers", "paper1")).toBe("/Users/sei/papers/paper1");
    expect(projectPath("/Users/sei/papers/", " paper1 ")).toBe("/Users/sei/papers/paper1");
  });
});

describe("BUILTIN_TEMPLATE", () => {
  it("執筆環境v2の構造を含む", () => {
    const keys = Object.keys(BUILTIN_TEMPLATE);
    expect(keys).toContain("paper.qmd");
    expect(keys).toContain("refs.bib");
    expect(keys).toContain("CLAUDE.md");
    expect(keys.some((k) => k.startsWith("notes/"))).toBe(true);
  });

  it("paper.qmd は閉じたYAMLフロントマターを持つ（quartoが読める形）", () => {
    const qmd = BUILTIN_TEMPLATE["paper.qmd"];
    expect(qmd.startsWith("---\n")).toBe(true);
    expect(/^---\n[\s\S]*?\n---\n/.test(qmd)).toBe(true);
  });

  it("CLAUDE.md に穴埋めの捏造禁止規約が入っている", () => {
    expect(BUILTIN_TEMPLATE["CLAUDE.md"]).toContain("該当なし");
    expect(BUILTIN_TEMPLATE["CLAUDE.md"]).toContain("勝手に補わない");
  });
});
