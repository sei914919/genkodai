// Phase 2 のワークフロー：穴埋め（FR14）・レンダー＋リント（FR18）・整合チェック（FR19）。
import type { EditorView } from "@codemirror/view";
import type { Marker } from "./parsers/derive";
import type { NoteEntry } from "./parsers/notes";
import { runProgram } from "./runner";
import { baseName } from "./fileio";

// 脚注に転記してよいのは出典の人間可読部分のみ。`[key: @…]` タグは転記しない
// （執筆環境v2 §5.4）。パーサが分離済みだが、二重の安全のためここでも除去する。
export function stripKeyTag(s: string): string {
  return s.replace(/\s*\[key:[^\]]*\]/g, "").trim();
}

// 脚注テキストの組み立て（FR14）。トピック名＋出典の人間可読部分。
export function buildFootnoteText(topic: string, entry: NoteEntry): string {
  const source = stripKeyTag(entry.source);
  const t = topic.trim();
  return t ? `${t}につき、${source}。` : `${source}。`;
}

// マーカーを脚注に置換する。単一トランザクションなので Cmd+Z で一手で戻せる。
export function fillMarker(
  view: EditorView,
  marker: Marker,
  entry: NoteEntry,
): void {
  const text = buildFootnoteText(marker.topic, entry);
  const insert = `^[${text}]`;
  view.dispatch({
    changes: { from: marker.from, to: marker.to, insert },
    selection: { anchor: marker.from + insert.length },
    scrollIntoView: true,
  });
  view.focus();
}

// FR18 レンダー。要出典の残数チェック（リント）は呼び出し側で行い、
// ここは quarto の実行のみを担う。quartoPath は §5.8 で解決したフルパス。
export interface RenderOutcome {
  ok: boolean;
  log: string;
  outputPath: string | null;
}

// quarto はカラー出力のANSIエスケープ（ESC [ ... m）を混ぜてくるため、パス抽出前に除去する。
// ESC が欠けた残骸（"[0m" のみ）も拾えるよう ESC は任意にする。
const ANSI_RE = /\u001b?\[[0-9;]*m/g;

export function stripAnsi(s: string): string {
  return s.replace(ANSI_RE, "");
}

// ログから出力ファイルの相対パスを取り出す（"Output created: paper.pdf"）。
export function parseOutputPath(log: string): string | null {
  const m = /Output created:\s*(.+)/.exec(stripAnsi(log));
  const rel = m?.[1]?.trim();
  return rel ? rel : null;
}

export async function renderQuarto(
  quartoPath: string,
  projectDir: string,
  qmdPath: string,
): Promise<RenderOutcome> {
  const file = baseName(qmdPath);
  const out = await runProgram(quartoPath, ["render", file], projectDir);
  const log = [out.stdout, out.stderr].filter(Boolean).join("\n");
  if (out.code !== 0) return { ok: false, log, outputPath: null };
  const rel = parseOutputPath(log);
  return {
    ok: true,
    log,
    // 相対パスなら projectDir 基準、絶対パスならそのまま
    outputPath: rel ? (rel.startsWith("/") ? rel : `${projectDir}/${rel}`) : null,
  };
}

// FR19 整合チェック：孤児キー・要出典残数・未保存変更をまとめて報告する。
export function integrityReport(params: {
  orphanKeys: string[];
  markerCount: number;
  unsaved: boolean;
  bibErrors: string[];
  noteFileCount: number;
  refCount: number;
}): string {
  const lines: string[] = [];
  lines.push(
    params.orphanKeys.length === 0
      ? `✓ 孤児キーなし（notes/ ${params.noteFileCount}ファイル ↔ refs.bib ${params.refCount}件）`
      : `⚠ 孤児キー ${params.orphanKeys.length} 件：${params.orphanKeys.map((k) => "@" + k).join(", ")}`,
  );
  lines.push(
    params.markerCount === 0
      ? "✓ 要出典の残りなし"
      : `⚠ 要出典が ${params.markerCount} 件残っています`,
  );
  lines.push(params.unsaved ? "⚠ 未保存の変更があります" : "✓ 未保存の変更なし");
  if (params.bibErrors.length > 0) {
    lines.push(`⚠ refs.bib のパース警告 ${params.bibErrors.length} 件：${params.bibErrors.join(" / ")}`);
  }
  return lines.join("\n");
}
