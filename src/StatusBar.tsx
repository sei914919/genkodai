// 下部ステータスバー（Word風）。左に字数系メトリクス、右に原稿ズームのスライダー。
// 表示専用：編集バッファ・ファイル保存には一切触れない。
import { useAppStore, ZOOM_MAX, ZOOM_MIN, ZOOM_STEP, ZOOM_DEFAULT } from "./store";
import styles from "./StatusBar.module.css";

export function StatusBar({ hasDoc }: { hasDoc: boolean }) {
  const derived = useAppStore((s) => s.derived);
  const selCount = useAppStore((s) => s.selCount);
  const zoom = useAppStore((s) => s.zoom);
  const setZoom = useAppStore((s) => s.setZoom);

  const pct = Math.round(zoom * 100);

  return (
    <div className={styles.bar}>
      <div className={styles.metrics}>
        {hasDoc && (
          <>
            <span className={styles.metric}>
              本文 {derived.charCount.toLocaleString()} 字
            </span>
            <span className={styles.metric}>
              脚注込 {derived.charCountWithNotes.toLocaleString()} 字
            </span>
            <span className={styles.metric}>脚注 {derived.footnotes.length}</span>
            <span className={styles.metric}>
              {derived.wordCount.toLocaleString()} words
            </span>
            <span className={styles.badge} data-open={derived.markers.length > 0}>
              要出典 {derived.markers.length}
            </span>
            {selCount > 0 && (
              <span className={styles.selection}>選択 {selCount.toLocaleString()} 字</span>
            )}
          </>
        )}
      </div>

      <div className={styles.zoom}>
        <button
          className={styles.zoomPct}
          onClick={() => setZoom(ZOOM_DEFAULT)}
          title="等倍（100%）に戻す"
        >
          {pct}%
        </button>
        <input
          className={styles.slider}
          type="range"
          min={Math.round(ZOOM_MIN * 100)}
          max={Math.round(ZOOM_MAX * 100)}
          step={Math.round(ZOOM_STEP * 100)}
          value={pct}
          onChange={(e) => setZoom(Number(e.target.value) / 100)}
          title="原稿の表示倍率（Ctrl+スクロールでも変えられます）"
          aria-label="原稿の表示倍率"
        />
      </div>
    </div>
  );
}
