import { useEffect, useState } from "react";
import { useAppStore } from "./store";
import { jumpTo } from "./editorActions";
import styles from "./LeftRail.module.css";

export function LeftRail() {
  const view = useAppStore((s) => s.view);
  const headings = useAppStore((s) => s.derived.headings);
  const markers = useAppStore((s) => s.derived.markers);
  const selectedMarkerIdx = useAppStore((s) => s.selectedMarkerIdx);
  const selectMarker = useAppStore((s) => s.selectMarker);

  // 現在のスクロール位置より上にある最後の見出しをハイライト（FR9）。
  // 紙面カードは中央ペインごとスクロールするため、CodeMirror の scroller ではなく
  // 実際にスクロールする祖先要素のイベントを捕捉相で拾う（scroll はバブルしないため capture）。
  const [activeLine, setActiveLine] = useState<number | null>(null);
  useEffect(() => {
    if (!view) return;
    const recompute = () => {
      const editorTop = view.scrollDOM.getBoundingClientRect().top;
      // 見出しが編集領域上端を少し過ぎたら「現在地」とみなす
      const threshold = Math.max(editorTop, 60) + 16;
      let current: number | null = null;
      for (const h of headings) {
        const coords = view.coordsAtPos(Math.min(h.from, view.state.doc.length));
        if (coords && coords.top <= threshold) current = h.line;
      }
      setActiveLine(current);
    };
    window.addEventListener("scroll", recompute, true); // capture: 子孫のscrollを拾う
    recompute();
    return () => window.removeEventListener("scroll", recompute, true);
  }, [view, headings]);

  const clickMarker = (idx: number) => {
    selectMarker(idx);
    jumpTo(view, markers[idx].from);
  };

  return (
    <div className={styles.rail}>
      <div className={styles.sectionLabel}>目次</div>
      {headings.length === 0 && <div className={styles.empty}>見出しなし</div>}
      {headings.map((h, i) => (
        <div
          key={`${h.from}-${i}`}
          className={
            h.line === activeLine ? styles.tocItemActive : styles.tocItem
          }
          style={{ paddingLeft: 16 + (h.level - 1) * 12 }}
          onClick={() => jumpTo(view, h.from)}
          title={h.text}
        >
          {h.text}
        </div>
      ))}

      <div className={styles.markerLabel}>朱 — 要出典</div>
      {markers.length === 0 && (
        <div className={styles.empty}>要出典マーカーなし</div>
      )}
      {markers.map((m, i) => (
        <div
          key={`${m.from}-${i}`}
          className={styles.markerItem}
          data-selected={selectedMarkerIdx === i}
          onClick={() => clickMarker(i)}
          title={m.topic}
        >
          <span className={styles.markerDot}>●</span>
          <span>{m.topic || "（トピック未記入）"}</span>
        </div>
      ))}

      <div className={styles.hint}>
        マーカーを選ぶと右の資料ペインが該当トピックに絞り込まれます
      </div>
    </div>
  );
}
