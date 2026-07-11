// FR4: セミWYSIWYGデコレーション（SPEC §1・§5.1・§5.2）。
//
// IME方針（CLAUDE.md / SPEC NFR1）:
// - view.composing 中は再計算せず、既存デコレーションを map で位置追従のみ。
//   確定後の最初の更新で再計算する（compositionイベントには触れない）。
// - 選択端が乗っている行は置換ウィジェットを外して生記法を表示（Obsidian方式）。
//   これにより変換開始時点でカーソル行にウィジェットが存在せず、
//   composition とウィジェット境界が隣接するケースが構造的に生じない。
// - 置換ウィジェットのみ atomicRanges に供給する（見出し行装飾は含めない）。

import {
  Decoration,
  DecorationSet,
  EditorView,
  ViewPlugin,
  ViewUpdate,
  WidgetType,
} from "@codemirror/view";
import type { Extension } from "@codemirror/state";
import {
  extractFootnotes,
  extractHeadings,
  extractMarkers,
} from "./parsers/derive";
import { useAppStore } from "./store";
import { C, FONT_UI } from "./theme";

// ---------- ウィジェット ----------

class MarkerWidget extends WidgetType {
  constructor(
    readonly topic: string,
    readonly ordinal: number, // 文書内の出現順（照合モード起動用）
  ) {
    super();
  }
  eq(other: MarkerWidget): boolean {
    return other.topic === this.topic && other.ordinal === this.ordinal;
  }
  toDOM(): HTMLElement {
    const el = document.createElement("span");
    el.className = "cm-gk-marker";
    el.textContent = `要出典: ${this.topic || "（未記入）"}`;
    el.title = "クリックで資料ペインを照合";
    el.onclick = () => {
      useAppStore.getState().selectMarker(this.ordinal);
    };
    return el;
  }
  ignoreEvent(): boolean {
    return false; // クリックでのカーソル配置（＝行の生記法表示）はCMに任せる
  }
}

class FootnoteWidget extends WidgetType {
  constructor(
    readonly n: number, // 表示上の番号（実体には書かない。SPEC §5.2）
    readonly text: string,
  ) {
    super();
  }
  eq(other: FootnoteWidget): boolean {
    return other.n === this.n && other.text === this.text;
  }
  toDOM(): HTMLElement {
    const el = document.createElement("sup");
    el.className = "cm-gk-fn";
    el.textContent = String(this.n);
    el.title = this.text;
    el.onclick = () => {
      useAppStore.getState().setRightTab("fn");
    };
    return el;
  }
  ignoreEvent(): boolean {
    return false;
  }
}

// ---------- 置換ウィジェット（マーカー・脚注） ----------

// 選択端（head/anchor）が乗っている行番号の集合
function cursorLines(view: EditorView): Set<number> {
  const lines = new Set<number>();
  for (const r of view.state.selection.ranges) {
    lines.add(view.state.doc.lineAt(r.head).number);
    lines.add(view.state.doc.lineAt(r.anchor).number);
  }
  return lines;
}

function buildInlineDecorations(view: EditorView): DecorationSet {
  const text = view.state.doc.toString();
  const exclude = cursorLines(view);
  const ranges = [];

  const markers = extractMarkers(text);
  for (let i = 0; i < markers.length; i++) {
    const m = markers[i];
    if (text.slice(m.from, m.to).includes("\n")) continue; // 行跨ぎは置換しない
    if (exclude.has(view.state.doc.lineAt(m.from).number)) continue;
    ranges.push(
      Decoration.replace({
        widget: new MarkerWidget(m.topic, i),
      }).range(m.from, m.to),
    );
  }

  for (const f of extractFootnotes(text)) {
    if (text.slice(f.from, f.to).includes("\n")) continue;
    if (exclude.has(view.state.doc.lineAt(f.from).number)) continue;
    ranges.push(
      Decoration.replace({
        widget: new FootnoteWidget(f.index, f.text),
      }).range(f.from, f.to),
    );
  }

  return Decoration.set(ranges, true);
}

const inlineWidgets = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    pending = false;

    constructor(view: EditorView) {
      this.decorations = buildInlineDecorations(view);
    }

    update(u: ViewUpdate): void {
      if (u.view.composing) {
        // IME変換中: 再計算しない。位置だけ追従（§設計宣言2）
        if (u.docChanged) this.decorations = this.decorations.map(u.changes);
        this.pending = true;
        return;
      }
      if (this.pending || u.docChanged || u.selectionSet || u.viewportChanged) {
        this.decorations = buildInlineDecorations(u.view);
        this.pending = false;
      }
    }
  },
  {
    decorations: (v) => v.decorations,
    provide: (plugin) =>
      EditorView.atomicRanges.of(
        (view) => view.plugin(plugin)?.decorations ?? Decoration.none,
      ),
  },
);

// ---------- 見出し行装飾（常時適用・カーソル非依存） ----------

function buildHeadingDecorations(view: EditorView): DecorationSet {
  const text = view.state.doc.toString();
  const ranges = [];
  for (const h of extractHeadings(text)) {
    ranges.push(
      Decoration.line({ class: `cm-gk-h${h.level}` }).range(h.from),
    );
    const prefix = /^#{1,4}\s+/.exec(text.slice(h.from, h.from + 8));
    if (prefix) {
      ranges.push(
        Decoration.mark({ class: "cm-gk-hmark" }).range(
          h.from,
          h.from + prefix[0].length,
        ),
      );
    }
  }
  return Decoration.set(ranges, true);
}

const headingLines = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    pending = false;

    constructor(view: EditorView) {
      this.decorations = buildHeadingDecorations(view);
    }

    update(u: ViewUpdate): void {
      if (u.view.composing) {
        if (u.docChanged) this.decorations = this.decorations.map(u.changes);
        this.pending = true;
        return;
      }
      if (this.pending || u.docChanged || u.viewportChanged) {
        this.decorations = buildHeadingDecorations(u.view);
        this.pending = false;
      }
    }
  },
  { decorations: (v) => v.decorations },
);

// ---------- 配色・書体（モックアップ準拠） ----------

const decoTheme = EditorView.baseTheme({
  ".cm-gk-h1": { fontSize: "22px", fontWeight: "700", lineHeight: "1.8" },
  ".cm-gk-h2": {
    fontSize: "16.5px",
    fontWeight: "700",
    lineHeight: "1.9",
    letterSpacing: "0.02em",
  },
  ".cm-gk-h3": { fontSize: "15.5px", fontWeight: "700", lineHeight: "1.9" },
  ".cm-gk-h4": { fontSize: "15px", fontWeight: "700", lineHeight: "1.9" },
  ".cm-gk-hmark": { color: C.faint, fontWeight: "400" },
  ".cm-gk-marker": {
    fontFamily: FONT_UI,
    fontSize: "11.5px",
    fontWeight: "700",
    color: C.shu,
    background: C.shuBg,
    border: `1px dashed ${C.shuLine}`,
    borderRadius: "4px",
    padding: "1px 7px",
    margin: "0 2px",
    cursor: "pointer",
    whiteSpace: "nowrap",
    verticalAlign: "0.15em",
  },
  ".cm-gk-fn": {
    color: C.ai,
    fontFamily: FONT_UI,
    fontSize: "11px",
    fontWeight: "700",
    cursor: "pointer",
    padding: "0 1px",
  },
});

export function semiWysiwyg(): Extension {
  return [headingLines, inlineWidgets, decoTheme];
}
