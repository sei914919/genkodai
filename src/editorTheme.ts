// 本エディタと読み取り専用の参照ペイン（2窓モード・FR25）で共有する紙面テーマ。
// バッファ・保存・監視には一切関与しない純粋な表示用スタイル（DRY）。

import { EditorView } from "@codemirror/view";
import { C, FONT_MS } from "./theme";

// ズーム倍率1.0のときの本文フォントサイズ
export const BASE_FONT_PX = 15;

// ズーム倍率だけを持つテーマ（Compartment で差し替える。バッファには触れない）
export function zoomTheme(zoom: number) {
  return EditorView.theme({ "&": { fontSize: `${BASE_FONT_PX * zoom}px` } });
}

export const paperTheme = EditorView.theme({
  // fontSize はズーム用 Compartment（zoomTheme）が制御する
  "&": { backgroundColor: "transparent" },
  ".cm-scroller": {
    fontFamily: FONT_MS,
    lineHeight: "2.05",
    overflow: "visible",
  },
  ".cm-content": { padding: "0", caretColor: C.ink },
  ".cm-line": { padding: "0" },
  "&.cm-focused": { outline: "none" },
  ".cm-cursor, .cm-dropCursor": { borderLeftColor: C.ink },
});
