import { describe, expect, it } from "vitest";
import { generationName, generationsToPrune } from "./snapshot";

describe("generationsToPrune", () => {
  it("5世代以下なら何も消さない", () => {
    expect(generationsToPrune(["20260711-100000"])).toEqual([]);
    expect(
      generationsToPrune([
        "20260711-100000",
        "20260711-110000",
        "20260711-120000",
        "20260711-130000",
        "20260711-140000",
      ]),
    ).toEqual([]);
  });

  it("6世代あれば最古の1つを消す（順序が乱れていても辞書順で判定）", () => {
    const gens = [
      "20260711-140000",
      "20260710-090000", // 最古
      "20260711-120000",
      "20260711-100000",
      "20260711-130000",
      "20260711-110000",
    ];
    expect(generationsToPrune(gens)).toEqual(["20260710-090000"]);
  });

  it("8世代なら古い3つを古い順に返す", () => {
    const gens = Array.from({ length: 8 }, (_, i) => `2026071${i}-000000`);
    expect(generationsToPrune(gens)).toEqual([
      "20260710-000000",
      "20260711-000000",
      "20260712-000000",
    ]);
  });
});

describe("generationName", () => {
  it("辞書順が時系列順になる形式", () => {
    const a = generationName(new Date(2026, 6, 11, 9, 5, 3));
    const b = generationName(new Date(2026, 6, 11, 10, 0, 0));
    expect(a).toBe("20260711-090503");
    expect(a < b).toBe(true);
  });
});
