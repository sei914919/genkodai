import { describe, expect, it } from "vitest";
import { MIN_SCORE, isExact, normalize, rankByTopic, score } from "./matching";

describe("normalize", () => {
  it("全角・空白・記号を吸収する", () => {
    expect(normalize("自己優遇 の 定義")).toBe(normalize("自己優遇の定義"));
    expect(normalize("ＡＢＣ")).toBe("abc");
    expect(normalize("自己優遇（定義）")).toBe("自己優遇定義");
  });
});

describe("score", () => {
  it("完全一致は100", () => {
    expect(score("自己優遇の定義", "自己優遇の定義")).toBe(100);
    expect(score("自己優遇 の定義", "自己優遇の定義")).toBe(100); // 正規化後の完全一致
  });

  it("包含関係は高スコア（80以上）", () => {
    expect(score("自己優遇", "自己優遇の定義")).toBeGreaterThanOrEqual(80);
    expect(score("自己優遇の定義と外延", "自己優遇の定義")).toBeGreaterThanOrEqual(80);
  });

  it("部分的に似ている見出しは中間スコア", () => {
    const s = score("自己優遇の競争上の害", "自己優遇の競争制限効果");
    expect(s).toBeGreaterThan(0);
    expect(s).toBeLessThan(80);
  });

  it("無関係な見出しは閾値未満", () => {
    expect(score("間接ネットワーク効果", "自己優遇の定義")).toBeLessThan(MIN_SCORE);
  });

  it("空文字は0", () => {
    expect(score("", "自己優遇の定義")).toBe(0);
  });
});

describe("isExact", () => {
  it("正規化後の一致を完全一致とみなす", () => {
    expect(isExact("自己優遇の定義", "自己優遇 の 定義")).toBe(true);
    expect(isExact("自己優遇", "自己優遇の定義")).toBe(false);
  });
});

describe("rankByTopic", () => {
  const headings = [
    "自己優遇の定義",
    "自己優遇の競争上の害",
    "間接ネットワーク効果と多面市場",
    "技術的抱き合わせ",
  ];

  it("完全一致を先頭に、一致度順で返す", () => {
    const r = rankByTopic("自己優遇の定義", headings, (h) => h);
    expect(r[0].item).toBe("自己優遇の定義");
    expect(r[0].exact).toBe(true);
    for (let i = 1; i < r.length; i++) {
      expect(r[i - 1].score).toBeGreaterThanOrEqual(r[i].score);
    }
  });

  it("ゆるい部分一致を拾う（見出しがトピックを含む）", () => {
    const r = rankByTopic("間接ネットワーク効果", headings, (h) => h);
    expect(r.map((x) => x.item)).toContain("間接ネットワーク効果と多面市場");
  });

  it("該当が無ければ空を返す（候補を生成しない = FR15/v2-NFR2）", () => {
    const r = rankByTopic("垂直的合併の審査基準", headings, (h) => h);
    expect(r).toHaveLength(0);
  });
});
