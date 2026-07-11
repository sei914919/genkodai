// Claude一括穴埋め（FR16/FR17 — SPEC §5.5）。
//
// フロー: pre-fillコミット → claude -p 実行（キャンセル可） → スキーマ検証＋
// 二重捏造ガード（proposalValidate） → UIレビュー → 承認分を適用 → 保存 →
// post-fillコミット。pre-fillコミットに失敗したら穴埋め自体を中止する。
//
// SPEC §5.5 からの既知の差異（実装時の claude --help 2.1.207 で確認）:
//   --max-turns フラグは存在しない。暴走・固着防止は本モジュールの
//   ハードタイムアウト（既定10分）＋キャンセルボタンで担保する。
//   上限到達はエラーではなく「途中結果なし・再実行を提案」として扱う（FR16-6）。
import type { EditorView } from "@codemirror/view";
import { spawnProgram } from "./runner";
import { gitCommitAll, gitState } from "./git";
import { atomicSave } from "./fileio";
import { extractMarkers } from "./parsers/derive";
import {
  validateProposals,
  type FillCandidate,
  type FillProposal,
} from "./proposalValidate";

export const FILL_TIMEOUT_MS = 10 * 60 * 1000;

// --json-schema に渡す提案スキーマ（SPEC §5.5）
export const PROPOSALS_SCHEMA = {
  type: "object",
  properties: {
    proposals: {
      type: "array",
      items: {
        type: "object",
        properties: {
          marker: { type: "string" },
          status: { enum: ["found", "not_found"] },
          candidates: {
            type: "array",
            items: {
              type: "object",
              properties: {
                source: { type: "string" },
                quote: { type: "string" },
                note_file: { type: "string" },
                footnote_text: { type: "string" },
              },
              required: ["source", "quote", "note_file", "footnote_text"],
            },
          },
        },
        required: ["marker", "status", "candidates"],
      },
    },
  },
  required: ["proposals"],
} as const;

// プロンプトテンプレート。quote の逐語転記規則（省略・中略記号の禁止）を必ず含める（SPEC §5.5）。
export function buildPrompt(topics: string[]): string {
  const list = topics.map((t, i) => `${i + 1}. ${t}`).join("\n");
  return `学術論文の脚注穴埋めを行う。本文中の要出典マーカー（トピック名）ごとに、notes/ ディレクトリの実在するメモから出典候補を探し、指定スキーマのJSONで返答せよ。

対象マーカー:
${list}

規則（アプリ側で機械検証され、違反候補は破棄される）:
- 情報源は notes/ 内に実在するエントリのみ。自身の知識から出典・引用を生成しない。
- quote は note_file 内に実在する連続した原文の逐語転記でなければならない。省略・要約・言い換え・中略記号（「…」「（中略）」等）の挿入は一切禁止。引用が長い場合は冒頭からの連続部分のみを切り出すこと。
- note_file はプロジェクトルートからの相対パス（例: notes/self-preferencing.md）。
- source は出典行の人間可読部分のみ。footnote_text は「<トピック>につき、<出典の人間可読部分>。」の形式とし、[key: @…] タグを含めない。
- 該当するメモが無いマーカーは status を "not_found" とし candidates を空配列にする。これはエラーではなく正常な報告である。推測で補完しない。
- 1マーカーに複数の候補があれば全て列挙する（選択は人間が行う）。`;
}

// --output-format json のエンベロープから提案オブジェクトを取り出す。
// structured_output を優先し、旧来の result（JSON文字列）にフォールバック。
// 未知フィールドは無視し、取れなければ throw（FR17 手動照合へ誘導）。
export function extractFromEnvelope(stdout: string): unknown {
  let env: unknown;
  try {
    env = JSON.parse(stdout);
  } catch {
    throw new Error("claude の応答がJSONとして解釈できません");
  }
  if (typeof env !== "object" || env === null) {
    throw new Error("claude の応答エンベロープが不正です");
  }
  const rec = env as Record<string, unknown>;
  if (rec.is_error === true) {
    throw new Error(`claude がエラーを返しました: ${String(rec.result ?? rec.subtype)}`);
  }
  if (typeof rec.structured_output === "object" && rec.structured_output !== null) {
    return rec.structured_output;
  }
  if (typeof rec.result === "string") {
    try {
      return JSON.parse(rec.result);
    } catch {
      throw new Error("result フィールドをJSONとして解釈できません");
    }
  }
  throw new Error("応答に structured_output / result が見つかりません");
}

export type FillPhase = "precommit" | "running";

export interface FillOutcome {
  status: "ok" | "cancelled" | "timeout";
  proposals: FillProposal[];
  warnings: string[];
  prompt: string;
  rawResponse: string;
  preCommitDetail: string;
}

export interface FillRun {
  cancel: () => void;
  done: Promise<FillOutcome>;
}

export interface FillOptions {
  claudePath: string;
  gitPath: string;
  projectDir: string;
  topics: string[];
  noteFiles: Map<string, string>; // 相対パス → 内容（quote検証用）
  timeoutMs?: number;
  onPhase?: (phase: FillPhase) => void;
}

export function startClaudeFill(opts: FillOptions): FillRun {
  let killFn: (() => Promise<void>) | null = null;
  let interruptFn: ((k: "cancelled" | "timeout") => void) | null = null;
  let cancelled = false;

  const done = (async (): Promise<FillOutcome> => {
    const timeoutMs = opts.timeoutMs ?? FILL_TIMEOUT_MS;

    // 1) pre-fill 自動コミット（ワークツリー全体を意図的に固定する。FR16-1 / v2-NFR7）
    opts.onPhase?.("precommit");
    const g = await gitState(opts.gitPath, opts.projectDir);
    if (!g.isRepo) {
      throw new Error("プロジェクトが git リポジトリではないため実行できません（git init してください）");
    }
    let preCommitDetail = "変更なし（既存コミットを監査点とする）";
    if (g.dirty) {
      const pre = await gitCommitAll(
        opts.gitPath,
        opts.projectDir,
        `pre-fill: ${new Date().toISOString()}`,
      );
      if (!pre.committed) {
        // コミットできなければ穴埋め自体を中止（監査点なしで書き換えない）
        throw new Error(`pre-fillコミットに失敗したため中止しました: ${pre.detail}`);
      }
      preCommitDetail = pre.detail;
    }

    // 2) claude -p 実行（読み取り系ツールのみ。書き込み権限は与えない）
    opts.onPhase?.("running");
    const prompt = buildPrompt(opts.topics);
    const spawned = await spawnProgram(
      opts.claudePath,
      [
        "-p",
        prompt,
        "--tools",
        "Read,Grep,Glob",
        "--allowedTools",
        "Read,Grep,Glob",
        "--output-format",
        "json",
        "--json-schema",
        JSON.stringify(PROPOSALS_SCHEMA),
      ],
      opts.projectDir,
    );
    killFn = spawned.kill;

    // kill 後の close イベントは（孫プロセスがパイプを握っていると）遅延しうるため、
    // キャンセル/タイムアウトは close を待たずに race で即座に決着させる。
    let interruptResolve: (k: "cancelled" | "timeout") => void = () => {};
    const interrupted = new Promise<"cancelled" | "timeout">((r) => {
      interruptResolve = r;
    });
    interruptFn = (k) => {
      spawned.kill().catch(() => {});
      interruptResolve(k);
    };
    const timer = setTimeout(() => interruptFn?.("timeout"), timeoutMs);

    const winner = await Promise.race([
      spawned.result.then((r) => ({ kind: "done" as const, r })),
      interrupted.then((k) => ({ kind: k })),
    ]).finally(() => clearTimeout(timer));

    if (winner.kind !== "done") {
      // 上限到達はエラーではなく「途中結果なし・再実行を提案」（FR16-6）
      return {
        status: winner.kind === "cancelled" || cancelled ? "cancelled" : "timeout",
        proposals: [],
        warnings: [],
        prompt,
        rawResponse: "",
        preCommitDetail,
      };
    }
    const res = winner.r;
    if (res.code !== 0) {
      throw new Error(`claude が異常終了しました (code=${res.code}): ${res.stderr || res.stdout}`);
    }

    // 3) エンベロープ抽出 → 二重捏造ガード
    const rawObj = extractFromEnvelope(res.stdout);
    const { proposals, warnings } = validateProposals(rawObj, opts.noteFiles);
    return {
      status: "ok",
      proposals,
      warnings,
      prompt,
      rawResponse: res.stdout,
      preCommitDetail,
    };
  })();

  return {
    cancel: () => {
      cancelled = true;
      if (interruptFn) interruptFn("cancelled");
      else killFn?.().catch(() => {});
    },
    done,
  };
}

// 承認済み候補の適用（FR16-4）：単一トランザクションで置換 → アトミック保存 → post-fillコミット。
export interface Approval {
  marker: string; // トピック名
  candidate: FillCandidate;
}

export async function applyApprovals(params: {
  view: EditorView;
  currentPath: string;
  gitPath: string;
  projectDir: string;
  approvals: Approval[];
}): Promise<{ applied: number; commitDetail: string }> {
  const { view, approvals } = params;
  const doc = view.state.doc.toString();
  const markers = extractMarkers(doc);
  const used = new Set<number>();
  const changes: { from: number; to: number; insert: string }[] = [];

  for (const a of approvals) {
    const idx = markers.findIndex((m, i) => !used.has(i) && m.topic === a.marker);
    if (idx === -1) continue; // マーカーが編集で消えていたらスキップ（適用しない）
    used.add(idx);
    changes.push({
      from: markers[idx].from,
      to: markers[idx].to,
      insert: `^[${a.candidate.footnote_text}]`,
    });
  }
  if (changes.length === 0) return { applied: 0, commitDetail: "適用対象なし" };

  view.dispatch({ changes }); // 単一トランザクション＝Cmd+Zで一手で戻る

  await atomicSave(params.currentPath, view.state.doc.toString());

  const post = await gitCommitAll(
    params.gitPath,
    params.projectDir,
    `post-fill: ${changes.length} footnotes`,
  );
  if (!post.committed) {
    throw new Error(
      `post-fillコミットに失敗しました（脚注は適用済み。手動でコミットしてください）: ${post.detail}`,
    );
  }
  return { applied: changes.length, commitDetail: post.detail };
}
