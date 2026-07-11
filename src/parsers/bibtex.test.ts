import { describe, expect, it } from "vitest";
import { parseBibtex } from "./bibtex";

// 使い捨てフィクスチャ（絶対規則6）。§5.4 の対応/非対応をひと通り含む。
const BIB = `% コメント行は無視される
@book{wakui2018,
  author    = {Wakui, Masako},
  title     = {Antimonopoly Law: Competition Law and Policy in Japan},
  publisher = {Edward Elgar},
  year      = {2018}
}

@article{sensui2018,
  author = "泉水文雄",
  title  = {自己優遇と{独占禁止法}},
  year   = 2018
}

@string{elgar = "Edward Elgar"}

@misc{brokentype,
  author = {No Closing Brace},
`;

describe("parseBibtex", () => {
  const result = parseBibtex(BIB);

  it("book/article を key・type・fields で取り出す", () => {
    const keys = result.entries.map((e) => e.key);
    expect(keys).toContain("wakui2018");
    expect(keys).toContain("sensui2018");
  });

  it("{value} と \"value\" の両方を読む", () => {
    const w = result.entries.find((e) => e.key === "wakui2018")!;
    expect(w.type).toBe("book");
    expect(w.fields.author).toBe("Wakui, Masako");
    expect(w.fields.year).toBe("2018");
    const s = result.entries.find((e) => e.key === "sensui2018")!;
    expect(s.fields.author).toBe("泉水文雄");
  });

  it("ネスト波括弧1段を保持する", () => {
    const s = result.entries.find((e) => e.key === "sensui2018")!;
    expect(s.fields.title).toBe("自己優遇と{独占禁止法}");
  });

  it("素の数値フィールドを読む", () => {
    const s = result.entries.find((e) => e.key === "sensui2018")!;
    expect(s.fields.year).toBe("2018");
  });

  it("@string は読み飛ばす", () => {
    expect(result.entries.find((e) => e.type === "string")).toBeUndefined();
  });

  it("閉じ括弧の無い壊れたエントリは errors に載せる", () => {
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.entries.find((e) => e.key === "brokentype")).toBeUndefined();
  });
});
