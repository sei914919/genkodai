import { describe, expect, it } from "vitest";
import { collectKeys, parseNotesFile } from "./notes";

// 使い捨てフィクスチャ（絶対規則6）。執筆環境v2 §5.3 テンプレート＋実運用で起きうる崩れを含む。
const NOTE = `# 自己優遇

## 自己優遇の定義
- 出典: 泉水文雄『独占禁止法』123頁  [key: @sensui2018]
  引用: 「自己優遇とは、プラットフォーム事業者が、自らが供給する商品又は役務を、
  競争者のそれよりも有利に取り扱う行為をいう。」
  メモ: Paper2 §2の導入で使える

- 出典: United States v. Google, Doc.1436, at 45  [key: —]
  引用: 「Self-preferencing occurs when a platform operator favors its own products.」
  メモ: 米国の定義アプローチ。判例なのでプレーンテキスト

## 自己優遇の競争上の害
- 出典: 泉水文雄『独占禁止法』88頁  [key: @sensui2018]
  引用: 「垂直統合されたプラットフォームによる自己優遇は…」
  メモ: 反競争効果の類型化がここ
`;

describe("parseNotesFile", () => {
  const parsed = parseNotesFile("notes/self-preferencing.md", NOTE);

  it("## 単位でトピックを分ける（# タイトルは無視）", () => {
    expect(parsed.topics.map((t) => t.heading)).toEqual([
      "自己優遇の定義",
      "自己優遇の競争上の害",
    ]);
  });

  it("出典を人間可読部分とキーに二層分解する", () => {
    const e = parsed.topics[0].entries[0];
    expect(e.source).toBe("泉水文雄『独占禁止法』123頁");
    expect(e.key).toBe("sensui2018");
    expect(e.parsed).toBe(true);
  });

  it("[key: —] は key=null として扱う", () => {
    const e = parsed.topics[0].entries[1];
    expect(e.key).toBeNull();
  });

  it("複数行の引用を結合する", () => {
    const e = parsed.topics[0].entries[0];
    expect(e.quote).toContain("競争者のそれよりも有利に取り扱う行為をいう");
    expect(e.memo).toBe("Paper2 §2の導入で使える");
  });

  it("collectKeys は重複を排して @キー を集める", () => {
    expect(collectKeys([parsed])).toEqual(["sensui2018"]);
  });
});

describe("parseNotesFile フォールバック（データを落とさない）", () => {
  it("テンプレート外の行は原文保持の未パースエントリになる", () => {
    const messy = `## 雑多メモ
これはテンプレートに従っていない自由記述のメモ。
- 出典: 何かの本 [key: @foo2020]
  引用: 「原文」
`;
    const parsed = parseNotesFile("notes/messy.md", messy);
    const topic = parsed.topics[0];
    const fallback = topic.entries.find((e) => !e.parsed && e.raw.includes("自由記述"));
    expect(fallback).toBeDefined();
    const good = topic.entries.find((e) => e.parsed);
    expect(good?.key).toBe("foo2020");
  });
});
