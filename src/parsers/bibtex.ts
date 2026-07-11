// 自前の軽量 BibTeX パーサ（SPEC §5.4）。
// 対応: @type{key, field = {value}|"value"|number, …}。ネスト括弧1段まで。
// 非対応（読み飛ばし）: @string, @preamble, crossref解決。コメントは無視。
// 出力: {key, type, fields} の配列。パース不能エントリは errors へ。

export interface BibEntry {
  key: string;
  type: string;
  fields: Record<string, string>;
}

export interface BibParseResult {
  entries: BibEntry[];
  errors: string[];
}

// `{...}` または `"..."` または 素の値 を pos から読み、値と次位置を返す。
// ネスト波括弧は1段まで対応（§5.4）。
function readValue(src: string, pos: number): { value: string; next: number } | null {
  while (pos < src.length && /\s/.test(src[pos])) pos++;
  const ch = src[pos];
  if (ch === "{") {
    let depth = 0;
    let i = pos;
    for (; i < src.length; i++) {
      if (src[i] === "{") depth++;
      else if (src[i] === "}") {
        depth--;
        if (depth === 0) {
          return { value: src.slice(pos + 1, i), next: i + 1 };
        }
      }
    }
    return null; // 閉じ括弧なし
  }
  if (ch === '"') {
    let i = pos + 1;
    for (; i < src.length; i++) {
      if (src[i] === '"') return { value: src.slice(pos + 1, i), next: i + 1 };
      if (src[i] === "{") {
        // "..." 内の { } はスキップ（1段）
        let depth = 1;
        i++;
        for (; i < src.length && depth > 0; i++) {
          if (src[i] === "{") depth++;
          else if (src[i] === "}") depth--;
        }
        i--;
      }
    }
    return null;
  }
  // 素の値（数値・単語）: , か } まで
  let i = pos;
  while (i < src.length && src[i] !== "," && src[i] !== "}") i++;
  const value = src.slice(pos, i).trim();
  if (value === "") return null;
  return { value, next: i };
}

// エントリ本体（{ ... } の中身）から field=value を抜く。
function parseFields(body: string): Record<string, string> {
  const fields: Record<string, string> = {};
  let pos = 0;
  while (pos < body.length) {
    // フィールド名
    while (pos < body.length && /[\s,]/.test(body[pos])) pos++;
    const nameMatch = /^([A-Za-z][A-Za-z0-9_-]*)\s*=/.exec(body.slice(pos));
    if (!nameMatch) break;
    const name = nameMatch[1].toLowerCase();
    pos += nameMatch[0].length;
    const read = readValue(body, pos);
    if (!read) break;
    fields[name] = read.value.replace(/\s+/g, " ").trim();
    pos = read.next;
    while (pos < body.length && /\s/.test(body[pos])) pos++;
    if (body[pos] === ",") pos++;
  }
  return fields;
}

export function parseBibtex(src: string): BibParseResult {
  const entries: BibEntry[] = [];
  const errors: string[] = [];
  const re = /@([A-Za-z]+)\s*\{/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    const type = m[1].toLowerCase();
    // 本体の対応する閉じ括弧を探す
    const open = re.lastIndex - 1;
    let depth = 0;
    let end = -1;
    for (let i = open; i < src.length; i++) {
      if (src[i] === "{") depth++;
      else if (src[i] === "}") {
        depth--;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    if (end === -1) {
      errors.push(`@${type}: 閉じ括弧が見つかりません`);
      break;
    }
    const inner = src.slice(open + 1, end);
    re.lastIndex = end + 1;

    if (type === "string" || type === "preamble" || type === "comment") continue;

    const commaIdx = inner.indexOf(",");
    const key = (commaIdx === -1 ? inner : inner.slice(0, commaIdx)).trim();
    if (key === "") {
      errors.push(`@${type}: キーが空です`);
      continue;
    }
    const fieldsBody = commaIdx === -1 ? "" : inner.slice(commaIdx + 1);
    entries.push({ key, type, fields: parseFields(fieldsBody) });
  }
  return { entries, errors };
}
