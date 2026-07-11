import { describe, expect, it } from "vitest";
import { normalizeWs, validateProposals } from "./proposalValidate";

// 使い捨てフィクスチャ（絶対規則6）
const NOTE_CONTENT = `# 自己優遇

## 自己優遇の定義
- 出典: 泉水文雄『独占禁止法』123頁  [key: @sensui2018]
  引用: 「自己優遇とは、プラットフォーム事業者が、自らが供給する商品又は役務を、
  競争者のそれよりも有利に取り扱う行為をいう。」
  メモ: Paper2 §2の導入で使える
`;

const noteFiles = new Map([["notes/self-preferencing.md", NOTE_CONTENT]]);

const candidate = (over: Partial<Record<string, string>> = {}) => ({
  source: "泉水文雄『独占禁止法』123頁",
  quote:
    "「自己優遇とは、プラットフォーム事業者が、自らが供給する商品又は役務を、競争者のそれよりも有利に取り扱う行為をいう。」",
  note_file: "notes/self-preferencing.md",
  footnote_text: "自己優遇の定義につき、泉水文雄『独占禁止法』123頁。",
  ...over,
});

const wrap = (candidates: unknown[], status = "found") => ({
  proposals: [{ marker: "自己優遇の定義", status, candidates }],
});

describe("validateProposals — 3系統（CLAUDE.mdテスト方針）", () => {
  it("① 正当な逐語引用が通る（改行・字下げの差は空白正規化で吸収）", () => {
    const r = validateProposals(wrap([candidate()]), noteFiles);
    expect(r.proposals[0].candidates).toHaveLength(1);
    expect(r.warnings).toHaveLength(0);
  });

  it("② 省略記号入りの quote が落ち、警告に載る", () => {
    const r = validateProposals(
      wrap([candidate({ quote: "「自己優遇とは…有利に取り扱う行為をいう。」" })]),
      noteFiles,
    );
    expect(r.proposals[0].candidates).toHaveLength(0);
    expect(r.warnings.some((w) => w.includes("逐語一致しない"))).toBe(true);
  });

  it("③ 実在しないファイル参照が落ち、警告に載る", () => {
    const r = validateProposals(
      wrap([candidate({ note_file: "notes/ghost.md" })]),
      noteFiles,
    );
    expect(r.proposals[0].candidates).toHaveLength(0);
    expect(r.warnings.some((w) => w.includes("実在しないファイル参照"))).toBe(true);
  });
});

describe("validateProposals — その他のガード", () => {
  it("footnote_text / source から [key:] タグを除去する", () => {
    const r = validateProposals(
      wrap([
        candidate({
          source: "泉水文雄『独占禁止法』123頁 [key: @sensui2018]",
          footnote_text: "定義につき、泉水123頁。[key: @sensui2018]",
        }),
      ]),
      noteFiles,
    );
    const c = r.proposals[0].candidates[0];
    expect(c.source).not.toContain("[key:");
    expect(c.footnote_text).not.toContain("[key:");
  });

  it("not_found は候補ゼロの正常系として保持される", () => {
    const r = validateProposals(
      { proposals: [{ marker: "間接ネットワーク効果", status: "not_found", candidates: [] }] },
      noteFiles,
    );
    expect(r.proposals[0].status).toBe("not_found");
    expect(r.warnings).toHaveLength(0);
  });

  it("言い換え（パラフレーズ）の quote も落ちる", () => {
    const r = validateProposals(
      wrap([candidate({ quote: "自己優遇とは自社サービスを優先する行為である" })]),
      noteFiles,
    );
    expect(r.proposals[0].candidates).toHaveLength(0);
  });

  it("proposals 配列が無ければ throw（FR17 手動照合への誘導）", () => {
    expect(() => validateProposals({ result: "ok" }, noteFiles)).toThrow();
  });

  it("found なのに全候補破棄なら専用の警告を出す", () => {
    const r = validateProposals(
      wrap([candidate({ note_file: "notes/ghost.md" })]),
      noteFiles,
    );
    expect(r.warnings.some((w) => w.includes("全候補が検証で破棄"))).toBe(true);
  });
});

describe("normalizeWs", () => {
  it("改行・タブ・全角空白を除去する", () => {
    expect(normalizeWs("あ い\nう\tえ　お")).toBe("あいうえお");
  });
});
