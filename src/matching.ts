// FR14 手動照合モードのマッチング。
// 要出典マーカーのトピック名と notes/ のトピック見出しを突き合わせ、
// 「見出し完全一致＋ゆるい部分一致」を一致度順に返す。
//
// 重要：ここは候補を「絞り込む」だけであり、候補を生成・補完しない（v2-NFR2）。
// スコアが閾値未満のものは候補にしない＝ゼロ件なら FR15 の「該当なし」になる。

export const MIN_SCORE = 30;

// 比較用正規化：NFKC・小文字化・空白と記号の除去
export function normalize(s: string): string {
  return s
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s　]/g, "")
    .replace(/[・･·,，、.。:：;；/／\\|｜()（）「」『』【】[\]{}"'’”\-–—_~〜]/g, "");
}

function bigrams(s: string): string[] {
  const chars = [...s];
  if (chars.length <= 1) return chars;
  const out: string[] = [];
  for (let i = 0; i < chars.length - 1; i++) out.push(chars[i] + chars[i + 1]);
  return out;
}

// Dice係数（0〜1）。文字bigramの重なり具合。
export function diceCoefficient(a: string, b: string): number {
  const ga = bigrams(a);
  const gb = bigrams(b);
  if (ga.length === 0 || gb.length === 0) return 0;
  const pool = new Map<string, number>();
  for (const g of ga) pool.set(g, (pool.get(g) ?? 0) + 1);
  let hits = 0;
  for (const g of gb) {
    const n = pool.get(g) ?? 0;
    if (n > 0) {
      hits++;
      pool.set(g, n - 1);
    }
  }
  return (2 * hits) / (ga.length + gb.length);
}

// トピック名と見出しの一致度（0〜100）。
export function score(topic: string, heading: string): number {
  const t = normalize(topic);
  const h = normalize(heading);
  if (t === "" || h === "") return 0;
  if (t === h) return 100;
  if (h.includes(t) || t.includes(h)) {
    // 包含関係：短い方が長い方をどれだけ覆っているかで 80〜95 に配分
    const ratio = Math.min(t.length, h.length) / Math.max(t.length, h.length);
    return 80 + Math.round(ratio * 15);
  }
  return Math.round(diceCoefficient(t, h) * 60);
}

export function isExact(topic: string, heading: string): boolean {
  return normalize(topic) !== "" && normalize(topic) === normalize(heading);
}

export interface Scored<T> {
  item: T;
  score: number;
  exact: boolean;
}

// 一致度順（降順）に絞り込む。閾値未満は候補にしない。
export function rankByTopic<T>(
  topic: string,
  items: T[],
  headingOf: (item: T) => string,
): Scored<T>[] {
  return items
    .map((item) => {
      const heading = headingOf(item);
      return { item, score: score(topic, heading), exact: isExact(topic, heading) };
    })
    .filter((s) => s.score >= MIN_SCORE)
    .sort((a, b) => b.score - a.score);
}
