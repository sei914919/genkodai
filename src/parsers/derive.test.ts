import { describe, expect, it } from "vitest";
import {
  countChars,
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
