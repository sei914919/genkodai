// Claude穴埋め提案のアプリ側検証（SPEC §5.5「二重の捏造ガード」）。
// --json-schema で構造は強制されるが、内容の真正性はここで機械的に担保する：
//   1. スキーマ形状の検証（欠落・型不一致は全体を不採用 → FR17 手動照合へ誘導）
//   2. footnote_text から [key: …] タグを除去（執筆環境v2 §5.4）
//   3. note_file が実在しない候補は破棄して警告
//   4. quote が note_file 内に空白正規化後の文字列一致で実在しない候補は破棄して警告
// 破棄は黙って行わない：warnings に理由付きで残し、UIで可視化する。
import { stripKeyTag } from "./workflow";

export interface FillCandidate {
  source: string;
  quote: string;
  note_file: string;
  footnote_text: string;
}

export interface FillProposal {
  marker: string;
  status: "found" | "not_found";
  candidates: FillCandidate[];
}

export interface ValidationResult {
  proposals: FillProposal[];
  warnings: string[];
}

// 空白正規化：あらゆる空白（改行・タブ・全角空白含む）を除去して比較する。
// 正当な逐語転記は改行位置や字下げが違っても一致し、省略・言い換えは一致しない。
export function normalizeWs(s: string): string {
  return s.replace(/\s+/g, "");
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

function asString(x: unknown): string | null {
  return typeof x === "string" ? x : null;
}

// noteFiles: 相対パス（例 "notes/self-preferencing.md"）→ ファイル内容
export function validateProposals(
  raw: unknown,
  noteFiles: Map<string, string>,
): ValidationResult {
  if (!isRecord(raw) || !Array.isArray(raw.proposals)) {
    throw new Error("提案JSONに proposals 配列がありません");
  }

  const warnings: string[] = [];
  const proposals: FillProposal[] = [];

  for (const p of raw.proposals) {
    if (!isRecord(p)) {
      warnings.push("形式不正の提案要素を破棄しました");
      continue;
    }
    const marker = asString(p.marker);
    const status = p.status === "found" || p.status === "not_found" ? p.status : null;
    if (marker === null || status === null) {
      warnings.push("marker/status が不正な提案を破棄しました");
      continue;
    }
    const rawCands = Array.isArray(p.candidates) ? p.candidates : [];
    const candidates: FillCandidate[] = [];

    for (const c of rawCands) {
      if (!isRecord(c)) {
        warnings.push(`「${marker}」: 形式不正の候補を破棄しました`);
        continue;
      }
      const source = asString(c.source);
      const quote = asString(c.quote);
      const noteFile = asString(c.note_file);
      const footnote = asString(c.footnote_text);
      if (source === null || quote === null || noteFile === null || footnote === null) {
        warnings.push(`「${marker}」: フィールド欠落の候補を破棄しました`);
        continue;
      }

      // note_file の実在チェック（相対パス完全一致、または末尾一致で許容）
      const key =
        noteFiles.has(noteFile)
          ? noteFile
          : [...noteFiles.keys()].find((k) => noteFile.endsWith(k)) ?? null;
      if (key === null) {
        warnings.push(
          `「${marker}」: 実在しないファイル参照（${noteFile}）の候補を破棄しました`,
        );
        continue;
      }

      // quote の逐語性チェック（空白正規化後の文字列一致）
      const q = normalizeWs(quote);
      if (q === "" || !normalizeWs(noteFiles.get(key)!).includes(q)) {
        warnings.push(
          `「${marker}」: quote が ${key} 内に逐語一致しない候補を破棄しました（省略・言い換えの疑い）`,
        );
        continue;
      }

      candidates.push({
        source: stripKeyTag(source),
        quote,
        note_file: key,
        footnote_text: stripKeyTag(footnote),
      });
    }

    if (status === "found" && candidates.length === 0 && rawCands.length > 0) {
      warnings.push(`「${marker}」: 全候補が検証で破棄されました。手動照合してください`);
    }
    proposals.push({ marker, status, candidates });
  }

  return { proposals, warnings };
}
