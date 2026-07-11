// notes/ エントリのパース（SPEC §5.3 / 執筆環境v2 §5.3 テンプレート）。
// 行指向。形式に合わない部分はデータを落とさず原文表示にフォールバックする（FR11）。
//
//   ## <トピック見出し>
//   - 出典: <人間可読文字列>  [key: @<キー>|—]
//     引用: <原文>（複数行可、次の「メモ:」まで）
//     メモ: <所感>（複数行可、次の「- 出典:」または見出しまで）

export interface NoteEntry {
  source: string; // 出典の人間可読部分（[key:] を除いたもの）
  key: string | null; // @なしのキー。`—` や未指定は null
  quote: string;
  memo: string;
  raw: string; // パース元の原文（フォールバック表示用）
  parsed: boolean; // 出典行として認識できたか
}

export interface NoteTopic {
  heading: string;
  entries: NoteEntry[];
}

export interface ParsedNoteFile {
  file: string; // 相対パス等の識別子
  topics: NoteTopic[];
}

const HEADING_RE = /^(#{1,6})\s+(.+?)\s*#*\s*$/;
const SOURCE_RE = /^\s*-\s*出典:\s*(.*)$/;
const KEY_RE = /\s*\[key:\s*([^\]]*)\]\s*$/;
const QUOTE_RE = /^\s*引用:\s*(.*)$/;
const MEMO_RE = /^\s*メモ:\s*(.*)$/;

function splitKey(sourceLine: string): { source: string; key: string | null } {
  const m = KEY_RE.exec(sourceLine);
  if (!m) return { source: sourceLine.trim(), key: null };
  const raw = m[1].trim();
  const source = sourceLine.slice(0, m.index).trim();
  if (raw === "" || raw === "—" || raw === "-") return { source, key: null };
  return { source, key: raw.replace(/^@/, "") };
}

export function parseNotesFile(file: string, content: string): ParsedNoteFile {
  const lines = content.split("\n");
  const topics: NoteTopic[] = [];
  // 見出し前に出典が現れる場合の受け皿（見出しの無いファイルを許容）
  let current: NoteTopic = { heading: "", entries: [] };
  const pushTopic = () => {
    if (current.heading !== "" || current.entries.length > 0) topics.push(current);
  };

  type Field = "quote" | "memo" | null;
  let entry: NoteEntry | null = null;
  let field: Field = null;

  const closeEntry = () => {
    if (entry) {
      entry.quote = entry.quote.trim();
      entry.memo = entry.memo.trim();
      entry.raw = entry.raw.replace(/\n+$/, "");
      current.entries.push(entry);
    }
    entry = null;
    field = null;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const h = HEADING_RE.exec(line);
    if (h && h[1].length <= 2) {
      // ## までをトピック境界とする（# はファイルタイトル扱いで無視）
      closeEntry();
      if (h[1].length === 2) {
        pushTopic();
        current = { heading: h[2].trim(), entries: [] };
      }
      continue;
    }
    const s = SOURCE_RE.exec(line);
    if (s) {
      closeEntry();
      const { source, key } = splitKey(s[1]);
      entry = { source, key, quote: "", memo: "", raw: line, parsed: true };
      field = null;
      continue;
    }
    if (entry) {
      entry.raw += "\n" + line;
      const q = QUOTE_RE.exec(line);
      if (q) {
        field = "quote";
        entry.quote = q[1];
        continue;
      }
      const mm = MEMO_RE.exec(line);
      if (mm) {
        field = "memo";
        entry.memo = mm[1];
        continue;
      }
      // 継続行（複数行の引用・メモ）
      if (field === "quote") entry.quote += "\n" + line;
      else if (field === "memo") entry.memo += "\n" + line;
      else if (line.trim() !== "") {
        // 出典行の直後に 引用/メモ ラベル無しの本文が来た場合はフォールバックとして未パース扱い
        entry.parsed = false;
      }
      continue;
    }
    // どのエントリにも属さない非空行：原文保持のためのフォールバックエントリ
    if (line.trim() !== "") {
      current.entries.push({
        source: "",
        key: null,
        quote: "",
        memo: "",
        raw: line,
        parsed: false,
      });
    }
  }
  closeEntry();
  pushTopic();
  return { file, topics };
}

// notes/ 全体から `[key: @…]` を集める（整合性チェック FR12 用）
export function collectKeys(files: ParsedNoteFile[]): string[] {
  const keys = new Set<string>();
  for (const f of files) {
    for (const t of f.topics) {
      for (const e of t.entries) {
        if (e.key) keys.add(e.key);
      }
    }
  }
  return [...keys];
}
