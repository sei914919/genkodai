import { describe, expect, it } from "vitest";
import {
  buildFootnoteText,
  integrityReport,
  parseOutputPath,
  stripAnsi,
  stripKeyTag,
} from "./workflow";
import type { NoteEntry } from "./parsers/notes";


const entry = (source: string): NoteEntry => ({
  source,
  key: "sensui2018",
  quote: "「…」",
  memo: "",
  raw: "",
  parsed: true,
});

describe("stripKeyTag", () => {
  it("[key: @…] タグを除去する（脚注に転記しない・v2 §5.4）", () => {
    expect(stripKeyTag("泉水文雄『独占禁止法』123頁  [key: @sensui2018]")).toBe(
      "泉水文雄『独占禁止法』123頁",
    );
    expect(stripKeyTag("United States v. Google [key: —]")).toBe(
      "United States v. Google",
    );
  });

  it("タグが無ければそのまま", () => {
    expect(stripKeyTag("泉水文雄『独占禁止法』123頁")).toBe("泉水文雄『独占禁止法』123頁");
  });
});

describe("buildFootnoteText", () => {
  it("トピック名＋出典の人間可読部分で組み立てる", () => {
    expect(buildFootnoteText("自己優遇の定義", entry("泉水文雄『独占禁止法』123頁"))).toBe(
      "自己優遇の定義につき、泉水文雄『独占禁止法』123頁。",
    );
  });

  it("出典に key タグが残っていても転記しない", () => {
    const e = entry("泉水文雄『独占禁止法』123頁 [key: @sensui2018]");
    expect(buildFootnoteText("自己優遇の定義", e)).not.toContain("key:");
    expect(buildFootnoteText("自己優遇の定義", e)).not.toContain("@");
  });

  it("トピック名が空でも壊れない", () => {
    expect(buildFootnoteText("", entry("泉水文雄『独占禁止法』123頁"))).toBe(
      "泉水文雄『独占禁止法』123頁。",
    );
  });
});

describe("integrityReport", () => {
  it("すべて健全なら✓のみ", () => {
    const r = integrityReport({
      orphanKeys: [],
      markerCount: 0,
      unsaved: false,
      bibErrors: [],
      noteFileCount: 2,
      refCount: 3,
    });
    expect(r).not.toContain("⚠");
    expect(r).toContain("孤児キーなし");
  });

  it("問題があれば⚠で列挙する", () => {
    const r = integrityReport({
      orphanKeys: ["ghost2020"],
      markerCount: 3,
      unsaved: true,
      bibErrors: ["@misc: 閉じ括弧が見つかりません"],
      noteFileCount: 1,
      refCount: 1,
    });
    expect(r).toContain("@ghost2020");
    expect(r).toContain("要出典が 3 件");
    expect(r).toContain("未保存の変更があります");
    expect(r).toContain("パース警告");
  });
});

describe("stripAnsi / parseOutputPath", () => {
  const ESC = "\u001b";

  it("ANSIカラーを除去する", () => {
    expect(stripAnsi(`${ESC}[91mERROR${ESC}[0m`)).toBe("ERROR");
  });

  it("素のログから出力パスを拾う", () => {
    expect(parseOutputPath("Output created: paper.pdf")).toBe("paper.pdf");
  });

  // 実際の quarto はカラー出力を混ぜてくる（この混入で「出力を開く」が壊れうる）
  it("ANSI混じりのログからも出力パスを拾う", () => {
    const log = [
      `${ESC}[1m${ESC}[34mrunning lualatex - 2${ESC}[39m${ESC}[22m`,
      "",
      `${ESC}[1mOutput created: paper.pdf${ESC}[0m`,
    ].join("\n");
    expect(parseOutputPath(log)).toBe("paper.pdf");
  });

  it("出力行が無ければ null", () => {
    expect(parseOutputPath("ERROR: something went wrong")).toBeNull();
  });
});
