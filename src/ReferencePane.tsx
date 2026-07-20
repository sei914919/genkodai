// FR25: 読み取り専用の参照ペイン（2窓モード）。
// 本エディタのバッファを鏡写しにして独立スクロールするだけの表示。
// store.view には登録せず、保存・dirty・監視・autosave には一切関与しない
// （＝原稿破損リスクゼロ・既存機能への波及ゼロ。SPEC §5.7・絶対規則1〜3）。

import { useEffect, useRef } from "react";
import { Compartment, EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { semiWysiwyg } from "./decorations";
import { paperTheme, zoomTheme } from "./editorTheme";
import { useAppStore } from "./store";
import styles from "./ReferencePane.module.css";

export function ReferencePane() {
  const mirrorText = useAppStore((s) => s.mirrorText);
  const zoom = useAppStore((s) => s.zoom);
  const headings = useAppStore((s) => s.derived.headings);
  const setSplitView = useAppStore((s) => s.setSplitView);
  const refSide = useAppStore((s) => s.refSide);
  const toggleRefSide = useAppStore((s) => s.toggleRefSide);

  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const zoomCompartment = useRef(new Compartment());
  const zoomRef = useRef(zoom);
  // 初回の mirrorText 適用はスキップする（マウント時の seed が最新で、
  // 直前に splitView OFF だった間 mirrorText が古いままの可能性があるため上書きを防ぐ）
  const seededRef = useRef(false);

  // 読み取り専用ビューを一度だけ生成し、本エディタの現在バッファで seed する。
  // history / 保存keymap / autosave / watch / dirty用の updateListener は一切付けない。
  useEffect(() => {
    if (!hostRef.current) return;
    const seed = useAppStore.getState().view?.state.doc.toString() ?? "";
    const view = new EditorView({
      state: EditorState.create({
        doc: seed,
        extensions: [
          EditorState.readOnly.of(true),
          EditorView.editable.of(false),
          markdown({ base: markdownLanguage }),
          EditorView.lineWrapping,
          paperTheme,
          zoomCompartment.current.of(zoomTheme(zoomRef.current)),
          semiWysiwyg(),
        ],
      }),
      parent: hostRef.current,
    });
    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, []);

  // 本エディタから流れてくる本文の写しでバッファ全体を差し替える。
  // 参照側の独立スクロール位置を保つため、差し替え前後で scrollTop を退避・復元する
  // （1章を見ている間に5章＝下方を編集しても参照位置が飛ばない）。
  useEffect(() => {
    if (!seededRef.current) {
      seededRef.current = true;
      return; // 初回は seed 済み。古い mirrorText で上書きしない
    }
    const view = viewRef.current;
    if (!view) return;
    if (mirrorText === view.state.doc.toString()) return;
    const top = view.scrollDOM.scrollTop;
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: mirrorText },
    });
    view.scrollDOM.scrollTop = top;
  }, [mirrorText]);

  // ズームは本エディタと同率（--zoom も App 側で共有）
  useEffect(() => {
    zoomRef.current = zoom;
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: zoomCompartment.current.reconfigure(zoomTheme(zoom)),
    });
  }, [zoom]);

  // 見出しへスクロール（selection/focus は動かさない＝本エディタの入力フォーカスを奪わない）
  const jumpTo = (from: number) => {
    const view = viewRef.current;
    if (!view) return;
    const pos = Math.min(from, view.state.doc.length);
    view.dispatch({ effects: EditorView.scrollIntoView(pos, { y: "start" }) });
  };

  return (
    <div className={styles.pane}>
      <div className={styles.head}>
        <span className={styles.label}>参照</span>
        <select
          className={styles.jump}
          value=""
          onChange={(e) => {
            const i = Number(e.target.value);
            if (Number.isInteger(i) && headings[i]) jumpTo(headings[i].from);
          }}
        >
          <option value="">章へジャンプ…</option>
          {headings.map((h, i) => (
            <option key={i} value={i}>
              {"　".repeat(Math.max(0, h.level - 1))}
              {h.text}
            </option>
          ))}
        </select>
        <button
          className={styles.swap}
          onClick={toggleRefSide}
          title={refSide === "left" ? "参照ペインを右へ移す" : "参照ペインを左へ移す"}
        >
          {refSide === "left" ? "⇄ 右へ" : "⇄ 左へ"}
        </button>
        <button
          className={styles.close}
          onClick={() => setSplitView(false)}
          title="参照ペインを閉じる"
        >
          閉じる
        </button>
      </div>
      <div className={styles.page}>
        <div ref={hostRef} />
      </div>
    </div>
  );
}
