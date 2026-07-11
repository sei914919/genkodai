// 新規プロジェクト作成（Phase 4a）。
//
// テンプレートは app config 領域の templates/default/ に置き、初回起動時に
// 組み込み既定を書き出す。以後ユーザーが直接編集して育てられる。
// 生成はそのフォルダの複製であり、アプリはプロジェクト側に独自ファイルを作らない。
import { appConfigDir } from "@tauri-apps/api/path";
import {
  exists,
  mkdir,
  readDir,
  readTextFile,
  writeTextFile,
} from "@tauri-apps/plugin-fs";

export const TEMPLATE_DIR = "templates/default";

// 組み込み既定テンプレート（執筆環境v2の構造）。相対パス → 内容。
// 空ディレクトリ（notes/）は .keep ではなくディレクトリ生成で表現する。
export const BUILTIN_TEMPLATE: Record<string, string> = {
  "paper.qmd": `---
title: "（タイトル）"
subtitle: "（副題）"
author: "（著者）"
format:
  pdf:
    documentclass: bxjsarticle
    classoption:
      - pandoc
      - ja=standard
    keep-tex: true
  docx: default
---

# はじめに

（本文。根拠が要る箇所には Cmd+Shift+F で要出典マーカーを打つ）

# おわりに
`,
  "refs.bib": `% 欧米二次文献のBibTeXエントリを追記する（日本語文献・判例はnotes/にプレーンテキストで）
`,
  "notes/.gitkeep": "",
  "CLAUDE.md": `# CLAUDE.md — 執筆プロジェクト

このフォルダは執筆環境v2の構造（paper.qmd / notes/ / refs.bib）に従う。

## 文献を追加するとき（pdfs/inbox/ に新規PDFが入ったら）
1. inbox のPDF冒頭を読み、著者・タイトル・年・出版社/掲載誌を抽出
2. ファイル名を \`著者名+年_短縮タイトル.pdf\`（半角英数）にリネームし pdfs/ 直下へ移動
3. 同じキーでBibTeXエントリを refs.bib に追記（欧米二次文献が対象。既存キーがあれば重複させない）
4. 書誌・頁・条文は原典と照合。推測で埋めない
※ スキャンPDF等で書誌が読めない場合は、私に書誌情報を尋ねてから BibTeX化する（勝手に推測しない）

## メモを足すとき（notes/ はトピック単位）
- 既存トピックがあれば追記、無ければ新規作成
- 1エントリ = 「出典: <人間可読の引用文字列> [key: @キー]」＋「引用: 原文コピペ（必須）」＋「メモ: 所感」
- 判例等キー無しは [key: —]
- 書誌・頁は原典と照合。推測で埋めない

## 脚注の穴埋め（paper.qmd の要出典を埋める）
1. 本文から \`^[要出典: <トピック>]\` を全て抽出
2. 各トピックで notes/ を読み、該当エントリを特定
3. 脚注案は「出典（人間可読部分）」と「引用文（原文）」を必ずセットで提示。[key:] タグは脚注に転記しない
4. notes/ に該当が無ければ「該当なし」と報告。勝手に補わない
5. 複数該当は列挙して私に選ばせる。私が確認してから確定
※ 日本語文献・各国判例はプレーンテキストで転記（@ を残さない）。欧米二次文献をCSLに乗せる場合のみ @キー を残す

## 整合性チェック（取り込み時に毎回）
- notes/ 内の全 @キー を抽出し refs.bib と突合、対応の無い孤児キーを報告

## レンダリング前
- 本文の \`要出典\` 残数を grep して報告。残っていれば警告
`,
  ".gitignore": `pdfs/
*.tex
*.pdf
*.docx
`,
};

// --- バリデーション（純粋関数：ユニットテスト対象） ---

export interface NameCheck {
  ok: boolean;
  reason?: string;
}

// プロジェクト名の妥当性。パス区切り・上位参照・先頭ドットを禁じる。
export function validateProjectName(name: string): NameCheck {
  const n = name.trim();
  if (n === "") return { ok: false, reason: "プロジェクト名を入力してください" };
  if (n.includes("/") || n.includes("\\")) {
    return { ok: false, reason: "名前にパス区切り文字（/ \\）は使えません" };
  }
  if (n === "." || n === ".." || n.startsWith(".")) {
    return { ok: false, reason: "名前をドットで始めることはできません" };
  }
  if (/[\0:]/.test(n)) return { ok: false, reason: "名前に使えない文字が含まれています" };
  return { ok: true };
}

export function projectPath(parentDir: string, name: string): string {
  return `${parentDir.replace(/\/+$/, "")}/${name.trim()}`;
}

// --- テンプレートの読み書き ---

async function templateRoot(): Promise<string> {
  return `${await appConfigDir()}/${TEMPLATE_DIR}`;
}

// 初回起動時に組み込み既定を書き出す。既にあれば触らない（ユーザーの編集を尊重）。
export async function ensureTemplate(): Promise<string> {
  const root = await templateRoot();
  if (await exists(root)) return root;
  for (const [rel, content] of Object.entries(BUILTIN_TEMPLATE)) {
    const full = `${root}/${rel}`;
    const dir = full.slice(0, full.lastIndexOf("/"));
    await mkdir(dir, { recursive: true });
    await writeTextFile(full, content);
  }
  return root;
}

// テンプレートフォルダを再帰的に読み出す（相対パス → 内容）。
export async function readTemplate(root: string): Promise<Map<string, string>> {
  const files = new Map<string, string>();
  const walk = async (dir: string, prefix: string): Promise<void> => {
    for (const e of await readDir(dir)) {
      const rel = prefix === "" ? e.name : `${prefix}/${e.name}`;
      if (e.isDirectory) await walk(`${dir}/${e.name}`, rel);
      else if (e.isFile) files.set(rel, await readTextFile(`${dir}/${e.name}`));
    }
  };
  await walk(root, "");
  return files;
}

// --- 生成 ---

export interface CreateResult {
  projectDir: string;
  created: string[];
}

// テンプレートを複製して新規プロジェクトを作る。
// 同名フォルダが既にあれば**中止**する（既存を上書き・混入させない。絶対規則1の精神）。
export async function createProject(
  parentDir: string,
  name: string,
  template: Map<string, string>,
): Promise<CreateResult> {
  const check = validateProjectName(name);
  if (!check.ok) throw new Error(check.reason);

  const dir = projectPath(parentDir, name);
  if (await exists(dir)) {
    throw new Error(
      `「${name}」は既に存在します。既存フォルダには上書きしません。別の名前を指定してください`,
    );
  }

  await mkdir(dir, { recursive: true });
  const created: string[] = [];
  for (const [rel, content] of template) {
    const full = `${dir}/${rel}`;
    const sub = full.slice(0, full.lastIndexOf("/"));
    await mkdir(sub, { recursive: true });
    await writeTextFile(full, content);
    created.push(rel);
  }
  return { projectDir: dir, created: created.sort() };
}
