import { describe, expect, it } from "vitest";
import {
  countChars,
  countWords,
  derive,
  extractFootnotes,
  extractHeadings,
  extractMarkers,
} from "./derive";

// 使い捨てフィクスチャ（絶対規則6）。SPEC §5.1/§5.2/§5.4 の例を素に構成。
const DOC = `---
title: 自己優遇規制の分析枠組み
format: pdf
---

# はじめに

本文の冒頭。自己優遇は競争課題である^[自己優遇規制の国際動向につき参照。]。

## 自己優遇の意義

本稿は自己優遇を垂直統合型と捉える^[要出典: 自己優遇の定義]。

### 小見出し

効果分析を前提とする^[要出典: 間接ネットワーク効果]。

\`\`\`r
# これはコードフェンス内の見出し風テキスト
\`\`\`

##### 深すぎる見出しは目次に出さない
`;

describe("extractHeadings", () => {
  it("#〜####のみ抽出し、YAMLとコードフェンス内を無視する", () => {
    const hs = extractHeadings(DOC);
    expect(hs.map((h) => h.text)).toEqual([
      "はじめに",
      "自己優遇の意義",
      "小見出し",
    ]);
    expect(hs.map((h) => h.level)).toEqual([1, 2, 3]);
  });

  it("行番号とオフセットが正しい", () => {
    const hs = extractHeadings(DOC);
    const first = hs[0];
    expect(DOC.slice(first.from, first.from + 6)).toBe("# はじめに");
    expect(first.line).toBe(6);
  });
});

describe("extractMarkers", () => {
  it("要出典マーカーのみをトピック名付きで抽出する", () => {
    const ms = extractMarkers(DOC);
    expect(ms.map((m) => m.topic)).toEqual([
      "自己優遇の定義",
      "間接ネットワーク効果",
    ]);
  });

  it("マーカー位置は ^ から始まる", () => {
    const ms = extractMarkers(DOC);
    expect(DOC.slice(ms[0].from, ms[0].from + 2)).toBe("^[");
  });
});

describe("extractFootnotes", () => {
  it("要出典を除く充填済み脚注を出現順に番号付けする", () => {
    const fns = extractFootnotes(DOC);
    expect(fns).toHaveLength(1);
    expect(fns[0].index).toBe(1);
    expect(fns[0].text).toBe("自己優遇規制の国際動向につき参照。");
  });
});

describe("countChars", () => {
  it("YAML・コードフェンス・脚注・マーカー・記号・空白を除いて数える", () => {
    // 本文として数えるべき断片（見出しテキストも含む。コードフェンス内は含まない）
    const fragments = [
      "はじめに",
      "本文の冒頭。自己優遇は競争課題である。",
      "自己優遇の意義",
      "本稿は自己優遇を垂直統合型と捉える。",
      "小見出し",
      "効果分析を前提とする。",
      "深すぎる見出しは目次に出さない",
    ];
    const expected = fragments.reduce((n, s) => n + [...s].length, 0);
    expect(countChars(DOC)).toBe(expected);
  });

  it("空文書は0", () => {
    expect(countChars("")).toBe(0);
  });
});

describe("countWords", () => {
  const EN_DOC = `---
title: Draft
---

# Intro

Self-preferencing is a well-known issue^[See the remarks.].

Code below:

\`\`\`
this code word should not count
\`\`\`

We don't stop here^[要出典: 効果].
`;

  it("英単語のみ数え、YAML・コードフェンス・脚注/マーカー内は除外する", () => {
    // Intro(1) / Self-preferencing is a well-known issue(5) /
    // Code below(2) / We don't stop here(4) = 12。フェンス内・脚注/マーカー内は除外。
    expect(countWords(EN_DOC)).toBe(12);
  });

  it("ハイフン・アポストロフィで繋がる語は1語として数える", () => {
    expect(countWords("well-known state-of-the-art don't")).toBe(3);
  });

  it("日本語のみの文書は0語", () => {
    expect(countWords("本文の冒頭。自己優遇は競争課題である。")).toBe(0);
  });
});

describe("derive の字数系フィールド", () => {
  // 本文A^[脚注B]。要出典^[要出典: X]。
  //   本文（マーカー/脚注除去）= 「本文A。要出典。」= 8字
  //   脚注テキスト「脚注B」= 3字 → 脚注込み = 11字
  //   要出典マーカーのテキストは脚注込みに加算しない
  const DOC = "本文A^[脚注B]。要出典^[要出典: X]。";

  it("charCount は本文のみ（脚注・マーカー抜き）", () => {
    expect(derive(DOC).charCount).toBe(8);
  });

  it("charCountWithNotes は本文＋脚注テキスト（要出典は加算しない）", () => {
    const d = derive(DOC);
    expect(d.footnotes).toHaveLength(1); // 脚注B のみ
    expect(d.markers).toHaveLength(1); // 要出典: X
    expect(d.charCountWithNotes).toBe(11);
  });
});
