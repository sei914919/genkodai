// Claude一括穴埋め（FR16/FR17）のUI：実行ボタン → 実行中（キャンセル可）→
// マーカーごとの候補レビュー（人間が個別承認/却下）→ 適用＋post-fillコミット。
// not_found は肯定的に表示する（＝メモがまだ無いと分かった、という進捗）。
import { useState } from "react";
import { applyApprovals, startClaudeFill, type FillRun } from "./claudeFill";
import { loadNoteContents } from "./loadProject";
import { atomicSave } from "./fileio";
import { missingHint } from "./binPaths";
import { fireAndReport } from "./async";
import { useAppStore } from "./store";
import styles from "./FillPanel.module.css";

// 実行中プロセスのハンドル（UIの再レンダーに巻き込まないためモジュール変数）
let currentRun: FillRun | null = null;

export function FillPanel() {
  const bins = useAppStore((s) => s.bins);
  const git = useAppStore((s) => s.git);
  const fill = useAppStore((s) => s.fill);
  const markers = useAppStore((s) => s.derived.markers);
  const setFill = useAppStore((s) => s.setFill);
  const resetFill = useAppStore((s) => s.resetFill);
  const setNotice = useAppStore((s) => s.setNotice);

  // マーカーごとの承認状態（proposals のインデックス → 候補インデックス）
  const [choice, setChoice] = useState<Record<number, number | null>>({});

  const canRun =
    !!bins.claude && !!bins.git && git.isRepo && markers.length > 0 && fill.phase === "idle";

  const runHint = !bins.claude
    ? `${missingHint("claude")}（それまでは手動照合で埋められます）`
    : !bins.git
      ? missingHint("git")
      : !git.isRepo
        ? "git リポジトリではないため実行できません（穴埋め前後の自動コミットが監査の前提です）"
        : markers.length === 0
          ? "要出典マーカーがありません"
          : "pre-fillコミット → Claude提案 → 人間承認 → 適用 → post-fillコミット";

  const startFill = async () => {
    const s = useAppStore.getState();
    if (!s.view || !s.currentPath || !s.projectDir || !s.bins.claude || !s.bins.git) return;
    setChoice({});
    setFill({ phase: "precommit", proposals: [], warnings: [], message: null });
    try {
      // バッファの未保存分を pre-fill コミットに含めるため先に保存する
      await atomicSave(s.currentPath, s.view.state.doc.toString());
      const noteFiles = await loadNoteContents(s.projectDir);
      const run = startClaudeFill({
        claudePath: s.bins.claude,
        gitPath: s.bins.git,
        projectDir: s.projectDir,
        topics: s.derived.markers.map((m) => m.topic),
        noteFiles,
        onPhase: (phase) => setFill({ phase }),
      });
      currentRun = run;
      const outcome = await run.done;
      if (outcome.status === "cancelled") {
        resetFill();
        setNotice("穴埋めをキャンセルしました。手動照合モードで続けられます");
        return;
      }
      if (outcome.status === "timeout") {
        setFill({
          phase: "idle",
          message:
            "時間上限に達したため中断しました。途中結果はありません。もう一度実行してください",
        });
        return;
      }
      setFill({
        phase: "review",
        proposals: outcome.proposals,
        warnings: outcome.warnings,
        prompt: outcome.prompt,
        rawResponse: outcome.rawResponse,
        message: null,
      });
    } catch (e) {
      setFill({ phase: "idle", message: `${e}` });
    } finally {
      currentRun = null;
    }
  };

  const apply = async () => {
    const s = useAppStore.getState();
    if (!s.view || !s.currentPath || !s.projectDir || !s.bins.git) return;
    const approvals = s.fill.proposals.flatMap((p, i) => {
      const c = choice[i];
      return c !== null && c !== undefined && p.candidates[c]
        ? [{ marker: p.marker, candidate: p.candidates[c] }]
        : [];
    });
    if (approvals.length === 0) {
      setNotice("承認された候補がありません");
      return;
    }
    setFill({ phase: "applying" });
    try {
      const r = await applyApprovals({
        view: s.view,
        currentPath: s.currentPath,
        gitPath: s.bins.git,
        projectDir: s.projectDir,
        approvals,
      });
      resetFill();
      setNotice(
        `脚注 ${r.applied} 件を適用してコミットしました（${r.commitDetail}）。逐語引用の最終照合は人間の責任です（v2-NFR4）`,
      );
    } catch (e) {
      setFill({ phase: "review", message: `${e}` });
    }
  };

  // ---- 表示 ----

  if (fill.phase === "idle") {
    return (
      <div className={styles.box}>
        <button
          className={styles.runBtn}
          disabled={!canRun}
          title={runHint}
          onClick={() => fireAndReport(startFill(), "Claude穴埋め")}
        >
          Claudeで一括穴埋め（要出典 {markers.length} 件）
        </button>
        {fill.message && <div className={styles.errorBox}>{fill.message}</div>}
        {!canRun && <div className={styles.hint}>{runHint}</div>}
      </div>
    );
  }

  if (fill.phase === "precommit" || fill.phase === "running") {
    return (
      <div className={styles.box}>
        <div className={styles.runningRow}>
          <span className={styles.runningLabel}>
            {fill.phase === "precommit"
              ? "pre-fill コミット中…"
              : "Claude が notes/ を照合中…（読み取り専用）"}
          </span>
          <button
            className={styles.cancelBtn}
            onClick={() => {
              currentRun?.cancel();
            }}
          >
            キャンセル
          </button>
        </div>
      </div>
    );
  }

  // review / applying
  const applying = fill.phase === "applying";
  const approvedCount = fill.proposals.filter(
    (p, i) => choice[i] !== null && choice[i] !== undefined && p.candidates[choice[i]!],
  ).length;

  return (
    <div className={styles.box}>
      <div className={styles.reviewTitle}>Claude の提案（承認するまで本文は変わりません）</div>

      {fill.message && <div className={styles.errorBox}>{fill.message}</div>}

      {fill.warnings.length > 0 && (
        <div className={styles.warnBox}>
          <div className={styles.warnTitle}>検証で破棄した候補（§5.5 捏造ガード）</div>
          {fill.warnings.map((w, i) => (
            <div key={i} className={styles.warnItem}>
              {w}
            </div>
          ))}
        </div>
      )}

      {fill.proposals.map((p, pi) => (
        <div key={pi} className={styles.proposal}>
          <div className={styles.proposalHead}>
            <span className={styles.proposalTopic}>{p.marker}</span>
            {p.status === "not_found" && (
              <span className={styles.notFoundTag}>該当なし — メモ未作成と判明（正常）</span>
            )}
          </div>
          {p.status === "not_found" ? (
            <div className={styles.notFoundBody}>
              notes/ に対応エントリがありません。原典を読んでメモを追加してから再実行してください（候補の生成・推測はしません）。
            </div>
          ) : p.candidates.length === 0 ? (
            <div className={styles.notFoundBody}>
              候補はすべて検証で破棄されました。上の警告を確認し、手動照合してください。
            </div>
          ) : (
            p.candidates.map((c, ci) => (
              <label
                key={ci}
                className={choice[pi] === ci ? styles.candidateSelected : styles.candidate}
              >
                <input
                  type="radio"
                  name={`p${pi}`}
                  checked={choice[pi] === ci}
                  onChange={() => setChoice((m) => ({ ...m, [pi]: ci }))}
                />
                <div className={styles.candidateBody}>
                  <div className={styles.candidateSource}>{c.source}</div>
                  <div className={styles.candidateQuote}>{c.quote}</div>
                  <div className={styles.candidateMeta}>
                    {c.note_file} ／ 脚注: {c.footnote_text}
                  </div>
                </div>
              </label>
            ))
          )}
          {p.status === "found" && p.candidates.length > 0 && (
            <button
              className={styles.rejectBtn}
              onClick={() => setChoice((m) => ({ ...m, [pi]: null }))}
              disabled={choice[pi] === null || choice[pi] === undefined}
            >
              このマーカーは却下（保留のまま残す）
            </button>
          )}
        </div>
      ))}

      <div className={styles.actions}>
        <button className={styles.discardBtn} onClick={resetFill} disabled={applying}>
          すべて破棄して閉じる
        </button>
        <button
          className={styles.applyBtn}
          onClick={() => fireAndReport(apply(), "承認候補の適用")}
          disabled={applying || approvedCount === 0}
        >
          {applying ? "適用中…" : `承認した ${approvedCount} 件を適用してコミット`}
        </button>
      </div>

      <details className={styles.log}>
        <summary>実行ログ（監査用・ファイルには保存されません）</summary>
        <div className={styles.logLabel}>プロンプト</div>
        <pre className={styles.logPre}>{fill.prompt}</pre>
        <div className={styles.logLabel}>生の応答</div>
        <pre className={styles.logPre}>{fill.rawResponse}</pre>
      </details>
    </div>
  );
}
