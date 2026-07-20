import { describe, expect, it } from "vitest";
import { forget, promote, type RecentProject } from "./recentProjects";

const mk = (dir: string): RecentProject => ({
  dir,
  name: dir.split("/").pop() ?? dir,
  openedAt: "2026-01-01T00:00:00.000Z",
});

describe("promote", () => {
  it("新規は先頭に載る", () => {
    const out = promote([mk("/a"), mk("/b")], mk("/c"));
    expect(out.map((r) => r.dir)).toEqual(["/c", "/a", "/b"]);
  });

  it("既存を開き直すと重複せず先頭へ昇格する", () => {
    const out = promote([mk("/a"), mk("/b"), mk("/c")], mk("/c"));
    expect(out.map((r) => r.dir)).toEqual(["/c", "/a", "/b"]);
  });

  it("上限を超えた古い分は落ちる", () => {
    const list = ["/a", "/b", "/c"].map(mk);
    const out = promote(list, mk("/d"), 3);
    expect(out.map((r) => r.dir)).toEqual(["/d", "/a", "/b"]);
  });

  it("昇格時に openedAt が新しいエントリの値になる", () => {
    const old = { ...mk("/a"), openedAt: "2020-01-01T00:00:00.000Z" };
    const fresh = { ...mk("/a"), openedAt: "2026-07-20T00:00:00.000Z" };
    const out = promote([old], fresh);
    expect(out).toHaveLength(1);
    expect(out[0].openedAt).toBe("2026-07-20T00:00:00.000Z");
  });
});

describe("forget", () => {
  it("指定した dir を除く", () => {
    const out = forget(["/a", "/b", "/c"].map(mk), "/b");
    expect(out.map((r) => r.dir)).toEqual(["/a", "/c"]);
  });

  it("存在しない dir を渡してもリストは変わらない", () => {
    const out = forget(["/a", "/b"].map(mk), "/z");
    expect(out.map((r) => r.dir)).toEqual(["/a", "/b"]);
  });
});
