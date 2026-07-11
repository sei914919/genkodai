import { useMemo, useState } from "react";
import { useAppStore } from "./store";
import { jumpTo } from "./editorActions";
import type { NoteEntry, NoteTopic, ParsedNoteFile } from "./parsers/notes";
import type { BibEntry } from "./parsers/bibtex";
import styles from "./RightPanel.module.css";

interface TopicHit {
  file: string;
  topic: NoteTopic;
  exact: boolean;
}

export function RightPanel() {
  const view = useAppStore((s) => s.view);
  const notes = useAppStore((s) => s.notes);
  const refs = useAppStore((s) => s.refs);
  const orphanKeys = useAppStore((s) => s.orphanKeys);
  const footnotes = useAppStore((s) => s.derived.footnotes);
  const markers = useAppStore((s) => s.derived.markers);
  const rightTab = useAppStore((s) => s.rightTab);
  const setRightTab = useAppStore((s) => s.setRightTab);
  const selectedMarkerIdx = useAppStore((s) => s.selectedMarkerIdx);
  const selectMarker = useAppStore((s) => s.selectMarker);

  return (
    <div className={styles.panel}>
      <div className={styles.tabs}>
        <Tab
          label="資料 notes/"
          active={rightTab === "notes"}
          badge={selectedMarkerIdx !== null ? 1 : 0}
          onClick={() => setRightTab("notes")}
        />
        <Tab
          label="文献 refs.bib"
          active={rightTab === "refs"}
          badge={orphanKeys.length}
          onClick={() => setRightTab("refs")}
        />
        <Tab
          label={`脚注 ${footnotes.length}`}
          active={rightTab === "fn"}
          onClick={() => setRightTab("fn")}
        />
      </div>

      <div className={styles.body}>
        {rightTab === "notes" && (
          <NotesTab
            notes={notes}
            matchTopic={
              selectedMarkerIdx !== null
                ? markers[selectedMarkerIdx]?.topic ?? null
                : null
            }
            onClearMatch={() => selectMarker(null)}
          />
        )}
        {rightTab === "refs" && <RefsTab refs={refs} orphanKeys={orphanKeys} />}
        {rightTab === "fn" && (
          <div>
            {footnotes.length === 0 && (
              <div className={styles.empty}>充填済みの脚注はまだありません。</div>
            )}
            {footnotes.map((f) => (
              <div
                key={f.from}
                className={styles.fnCard}
                onClick={() => jumpTo(view, f.from)}
              >
                <span className={styles.fnNum}>{f.index}</span>
                <span className={styles.fnText}>{f.text}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Tab({
  label,
  active,
  badge,
  onClick,
}: {
  label: string;
  active: boolean;
  badge?: number;
  onClick: () => void;
}) {
  return (
    <button
      className={active ? styles.tabActive : styles.tab}
      onClick={onClick}
    >
      {label}
      {badge ? <span className={styles.badge}>{badge}</span> : null}
    </button>
  );
}

function NotesTab({
  notes,
  matchTopic,
  onClearMatch,
}: {
  notes: ParsedNoteFile[];
  matchTopic: string | null;
  onClearMatch: () => void;
}) {
  const [query, setQuery] = useState("");

  const hits = useMemo<TopicHit[]>(() => {
    const all: TopicHit[] = [];
    for (const f of notes) {
      for (const topic of f.topics) {
        all.push({ file: f.file, topic, exact: false });
      }
    }
    if (matchTopic) {
      // 照合モード：完全一致を先頭に、ゆるい部分一致も一致度順で（FR14相当の表示のみ）
      return all
        .filter(
          (h) =>
            h.topic.heading === matchTopic ||
            h.topic.heading.includes(matchTopic) ||
            matchTopic.includes(h.topic.heading),
        )
        .map((h) => ({ ...h, exact: h.topic.heading === matchTopic }))
        .sort((a, b) => Number(b.exact) - Number(a.exact));
    }
    const q = query.trim();
    if (!q) return all;
    return all.filter(
      (h) =>
        h.topic.heading.includes(q) ||
        h.topic.entries.some(
          (e) =>
            e.source.includes(q) || e.quote.includes(q) || e.memo.includes(q),
        ),
    );
  }, [notes, matchTopic, query]);

  return (
    <>
      {matchTopic !== null ? (
        <div className={styles.matchBar}>
          <span className={styles.matchLabel}>照合中:</span>
          <span className={styles.matchTopic}>{matchTopic || "（未記入）"}</span>
          <button className={styles.matchClear} onClick={onClearMatch}>
            解除
          </button>
        </div>
      ) : (
        <input
          className={styles.search}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="トピック・出典・引用文を検索"
        />
      )}

      {matchTopic !== null && hits.length === 0 && (
        <div className={styles.noMatch}>
          <div className={styles.noMatchTitle}>該当なし</div>
          「{matchTopic || "（未記入）"}」に一致するエントリは notes/
          にありません。出典を勝手には補いません（v2-NFR2）。原典を読んでメモを追加してから再照合してください。
        </div>
      )}

      {hits.map((h) => (
        <div key={`${h.file}:${h.topic.heading}`} className={styles.topicBlock}>
          <div className={styles.topicHeading}>
            {h.topic.heading || "（見出しなし）"}
            {h.exact && <span className={styles.exactTag}>完全一致</span>}
            <span className={styles.fileTag}>{h.file}</span>
          </div>
          {h.topic.entries.map((e, i) => (
            <EntryCard key={i} entry={e} />
          ))}
        </div>
      ))}
    </>
  );
}

function EntryCard({ entry }: { entry: NoteEntry }) {
  if (!entry.parsed && entry.source === "") {
    // テンプレート外の行はフォールバックで原文表示（FR11・データを落とさない）
    return <div className={styles.rawCard}>{entry.raw}</div>;
  }
  return (
    <div className={styles.entryCard}>
      <div className={styles.entryHead}>
        <span className={styles.entrySource}>{entry.source}</span>
        <span
          className={entry.key ? styles.keyChip : styles.keyChipNone}
        >
          {entry.key ? `key: ${entry.key}` : "key: —"}
        </span>
      </div>
      {entry.quote && <div className={styles.entryQuote}>{entry.quote}</div>}
      {entry.memo && <div className={styles.entryMemo}>メモ: {entry.memo}</div>}
    </div>
  );
}

function RefsTab({ refs, orphanKeys }: { refs: BibEntry[]; orphanKeys: string[] }) {
  return (
    <>
      {orphanKeys.length > 0 && (
        <div className={styles.orphanBox}>
          <div className={styles.orphanTitle}>
            孤児キー {orphanKeys.length} 件（refs.bib に該当なし）
          </div>
          <div className={styles.orphanList}>
            {orphanKeys.map((k) => (
              <span key={k} className={styles.orphanKey}>
                @{k}
              </span>
            ))}
          </div>
          <div className={styles.orphanHint}>
            notes/ が参照しているが refs.bib に登録されていないキーです（FR12）。
          </div>
        </div>
      )}
      {refs.length === 0 && (
        <div className={styles.empty}>refs.bib が空、または未配置です。</div>
      )}
      {refs.map((r) => (
        <div key={r.key} className={styles.refCard}>
          <div className={styles.refHead}>
            <span className={styles.refKey}>@{r.key}</span>
            <span className={styles.refType}>{r.type}</span>
          </div>
          <div className={styles.refTitle}>
            {r.fields.author && `${r.fields.author}『`}
            {r.fields.title ?? "(no title)"}
            {r.fields.author && "』"}
          </div>
          <div className={styles.refMeta}>
            {[r.fields.publisher, r.fields.year].filter(Boolean).join(", ")}
          </div>
        </div>
      ))}
    </>
  );
}
