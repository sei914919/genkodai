// paper.qmd 本文から派生情報を抽出する（SPEC §5.1 マーカー / §5.2 脚注 / FR7 字数 / FR9 目次）。
// CodeMirror には依存せず、素の文字列だけを入力にとる（テスト可能性のため）。

export interface Heading {
  level: number; // 1〜4
  text: string;
  from: number; // 文字オフセット（ジャンプ用）
  line: number; // 1始まり
}

export interface Marker {
  topic: string;
  from: number; // `^` の位置
  to: number; // 閉じ `]` の次
  line: number;
}

export interface Footnote {
  index: number; // 出現順の番号（表示用。実体には書かない）
  text: string;
  from: number;
  to: number;
  line: number;
}

export interface Derived {
  headings: Heading[];
  markers: Marker[];
  footnotes: Footnote[];
  charCount: number;
}

const MARKER_RE = /\^\[要出典:\s*([^\]]*)\]/g;
// 要出典マーカー以外のインライン脚注（§5.2）
const FOOTNOTE_RE = /\^\[(?!要出典:)([^\]]*)\]/g;

// 先頭のYAMLフロントマターの範囲 [start,end)（本文から除外する）を返す。無ければ null。
function frontmatterRange(text: string): [number, number] | null {
  if (!text.startsWith("---")) return null;
  // 開始の `---` 行の直後から、次に現れる `---` 行までを丸ごとフロントマターとする
  const m = /^---[^\n]*\n([\s\S]*?)\n---[^\n]*(\n|$)/.exec(text);
  if (!m) return null;
  return [0, m.index + m[0].length];
}

function lineAt(text: string, offset: number): number {
  let line = 1;
  for (let i = 0; i < offset && i < text.length; i++) {
    if (text[i] === "\n") line++;
  }
  return line;
}

export function extractHeadings(text: string): Heading[] {
  const fm = frontmatterRange(text);
  const fmEnd = fm ? fm[1] : 0;
  const headings: Heading[] = [];
  let inFence = false;
  let offset = 0;
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineStart = offset;
    offset += line.length + 1; // +1 は改行分
    if (lineStart < fmEnd) continue; // フロントマター内は無視
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const m = /^(#{1,4})\s+(.+?)\s*#*\s*$/.exec(line);
    if (m) {
      headings.push({
        level: m[1].length,
        text: m[2].trim(),
        from: lineStart,
        line: i + 1,
      });
    }
  }
  return headings;
}

export function extractMarkers(text: string): Marker[] {
  const markers: Marker[] = [];
  MARKER_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = MARKER_RE.exec(text)) !== null) {
    markers.push({
      topic: m[1].trim(),
      from: m.index,
      to: m.index + m[0].length,
      line: lineAt(text, m.index),
    });
  }
  return markers;
}

export function extractFootnotes(text: string): Footnote[] {
  const footnotes: Footnote[] = [];
  FOOTNOTE_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  let n = 0;
  while ((m = FOOTNOTE_RE.exec(text)) !== null) {
    n++;
    footnotes.push({
      index: n,
      text: m[1].trim(),
      from: m.index,
      to: m.index + m[0].length,
      line: lineAt(text, m.index),
    });
  }
  return footnotes;
}

// FR7 本文字数：YAMLヘッダ・コードフェンス・脚注・マーカー・行頭記号・空白を除外した文字数。
export function countChars(text: string): number {
  const fm = frontmatterRange(text);
  const fmEnd = fm ? fm[1] : 0;
  let count = 0;
  let inFence = false;
  let offset = 0;
  const lines = text.split("\n");
  for (const line of lines) {
    const lineStart = offset;
    offset += line.length + 1;
    if (lineStart < fmEnd) continue; // YAMLフロントマター
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue; // コードフェンス内は本文ではない
    let body = line.replace(/\^\[[^\]]*\]/g, ""); // インライン脚注・マーカー除去
    body = body.replace(/^\s*(#{1,6}|>|[-*+])\s+/, ""); // 行頭の見出し・引用・リスト記号
    body = body.replace(/\s/g, ""); // 空白除去
    count += [...body].length;
  }
  return count;
}

export function derive(text: string): Derived {
  return {
    headings: extractHeadings(text),
    markers: extractMarkers(text),
    footnotes: extractFootnotes(text),
    charCount: countChars(text),
  };
}
