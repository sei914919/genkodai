import { describe, expect, it } from "vitest";
import { buildFootnoteText, integrityReport, stripKeyTag } from "./workflow";
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
