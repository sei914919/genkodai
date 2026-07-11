// 共有された EditorView へ外側から作用する操作（FR8 挿入 / FR9・FR10・FR13 ジャンプ）。
// CodeMirror の extension 構成・keymap には一切触れず、トランザクションの dispatch のみで行う。
import { EditorView } from "@codemirror/view";

export function jumpTo(view: EditorView | null, pos: number): void {
  if (!view) return;
  const clamped = Math.max(0, Math.min(pos, view.state.doc.length));
  view.dispatch({
    selection: { anchor: clamped },
    effects: EditorView.scrollIntoView(clamped, { y: "center" }),
  });
  view.focus();
}

// FR8: カーソル位置に `^[要出典: ]` を挿入し、トピック名入力位置へカーソルを置く。
export function insertRequireCitation(view: EditorView | null): void {
  if (!view) return;
  const head = view.state.selection.main.head;
  const prefix = "^[要出典: ";
  const suffix = "]";
  view.dispatch({
    changes: { from: head, insert: prefix + suffix },
    selection: { anchor: head + prefix.length },
  });
  view.focus();
}
