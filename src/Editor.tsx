import { useEffect, useRef } from "react";
import { Annotation, EditorState } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { watch } from "@tauri-apps/plugin-fs";
import { atomicSave, contentHash, diskHash, loadFile, readFileRaw } from "./fileio";
import { fireAndReport } from "./async";
import { useAppStore } from "./store";
import { derive } from "./parsers/derive";
import { semiWysiwyg } from "./decorations";
import { C, FONT_MS } from "./theme";

const DERIVE_DEBOUNCE_MS = 150; // SPEC §5.6

// プログラム起因のバッファ置換（読込・外部変更の再読込）を編集と区別するための注釈。
// これが付いたトランザクションでは dirty 化・自動保存予約をしない。
const ProgrammaticLoad = Annotation.define<boolean>();

const AUTOSAVE_IDLE_MS = 2000;

const paperTheme = EditorView.theme({
  "&": { fontSize: "15px", backgroundColor: "transparent" },
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

export function Editor() {
  const projectDir = useAppStore((s) => s.projectDir);
  const currentPath = useAppStore((s) => s.currentPath);
  const setSaveStatus = useAppStore((s) => s.setSaveStatus);
  const setNotice = useAppStore((s) => s.setNotice);
  const setView = useAppStore((s) => s.setView);
  const setDerived = useAppStore((s) => s.setDerived);

  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const loadedPathRef = useRef<string | null>(null);
  const dirtyRef = useRef(false);
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const deriveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savingRef = useRef(false);

  // 読み取り専用：doc から派生情報（目次・マーカー・脚注・字数）を再計算してストアへ。
  // IME・入力・keymap・装飾には一切関与しない（§5.6）。
  const scheduleDerive = () => {
    if (deriveTimerRef.current) clearTimeout(deriveTimerRef.current);
    deriveTimerRef.current = setTimeout(() => {
      const view = viewRef.current;
      if (view) setDerived(derive(view.state.doc.toString()));
    }, DERIVE_DEBOUNCE_MS);
  };

  const saveNow = async (): Promise<void> => {
    const view = viewRef.current;
    const path = loadedPathRef.current;
    if (!view || !path || !dirtyRef.current || savingRef.current) return;
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    savingRef.current = true;
    setSaveStatus("saving");
    const text = view.state.doc.toString();
    try {
      await atomicSave(path, text);
      if (view.state.doc.toString() === text) {
        dirtyRef.current = false;
        setSaveStatus("clean");
      } else {
        // 保存中にさらに入力があった。dirty のまま次の自動保存に任せる。
        setSaveStatus("dirty");
        scheduleAutosave();
      }
    } catch (e) {
      setSaveStatus("dirty");
      setNotice(`保存に失敗しました: ${e}`);
    } finally {
      savingRef.current = false;
    }
  };

  const scheduleAutosave = () => {
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = setTimeout(() => {
      fireAndReport(saveNow(), "自動保存");
    }, AUTOSAVE_IDLE_MS);
  };

  const replaceBuffer = (text: string, keepCursor: boolean) => {
    const view = viewRef.current;
    if (!view) return;
    const pos = keepCursor
      ? Math.min(view.state.selection.main.head, text.length)
      : 0;
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: text },
      selection: { anchor: pos },
      annotations: ProgrammaticLoad.of(true),
    });
  };

  // EditorView は一度だけ生成する（IMEはCodeMirror本体に任せ、独自のキー介入をしない）
  useEffect(() => {
    if (!containerRef.current) return;
    const view = new EditorView({
      state: EditorState.create({
        doc: "",
        extensions: [
          history(),
          keymap.of([
            {
              key: "Mod-s",
              preventDefault: true,
              run: () => {
                fireAndReport(saveNow(), "保存");
                return true;
              },
            },
            ...defaultKeymap,
            ...historyKeymap,
          ]),
          markdown({ base: markdownLanguage }),
          EditorView.lineWrapping,
          paperTheme,
          semiWysiwyg(),
          EditorView.updateListener.of((u) => {
            if (!u.docChanged) return;
            scheduleDerive(); // 読込・編集を問わず派生情報を更新
            if (u.transactions.some((tr) => tr.annotation(ProgrammaticLoad))) return;
            dirtyRef.current = true;
            setSaveStatus("dirty");
            scheduleAutosave();
          }),
        ],
      }),
      parent: containerRef.current,
    });
    viewRef.current = view;
    setView(view);
    return () => {
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
      if (deriveTimerRef.current) clearTimeout(deriveTimerRef.current);
      view.destroy();
      viewRef.current = null;
      loadedPathRef.current = null;
      setView(null);
    };
  }, []);

  // ファイル切替：バッファ破棄前に未保存変更を確認し、あれば保存してから読み込む（絶対規則2）
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!currentPath || !viewRef.current) return;
      if (currentPath === loadedPathRef.current) return;
      if (dirtyRef.current && loadedPathRef.current) await saveNow();
      const text = await loadFile(currentPath);
      if (cancelled) return;
      loadedPathRef.current = currentPath;
      dirtyRef.current = false;
      replaceBuffer(text, false);
      setSaveStatus("clean");
      viewRef.current?.focus();
    })().catch((e) => setNotice(`読み込みに失敗しました: ${e}`));
    return () => {
      cancelled = true;
    };
  }, [currentPath]);

  // ファイル監視（§5.7）：内容ハッシュ比較で自己保存イベントを無視する。
  // 外部変更は未編集時のみ黙って再読込（FR6簡易版）。
  useEffect(() => {
    if (!projectDir) return;
    let disposed = false;
    let unwatch: (() => void) | null = null;

    const onEvent = async (event: { paths: string[] }) => {
      const path = loadedPathRef.current;
      // FSEventsはfirmlink経由の別表記（/System/Volumes/Data前置き等）を返すことがあるため
      // 完全一致に加えて後方一致でも照合する
      if (!path || !event.paths.some((p) => p === path || p.endsWith(path))) return;
      let text: string;
      try {
        text = await readFileRaw(path);
      } catch {
        return; // rename途中・一時的に読めない場合は次のイベントに任せる
      }
      const h = contentHash(text);
      if (h === diskHash.get(path)) return; // 自己保存（または変化なし）→ 無視
      if (dirtyRef.current) {
        setNotice("外部変更を検知しましたが、未保存の編集があるため再読込しません");
        return;
      }
      diskHash.set(path, h);
      replaceBuffer(text, true);
      setNotice("外部変更を検知し、再読み込みしました");
    };

    watch(
      projectDir,
      (e) => {
        fireAndReport(onEvent(e as { paths: string[] }), "外部変更の処理");
      },
      { delayMs: 300 },
    )
      .then((fn) => {
        if (disposed) fn();
        else unwatch = fn;
      })
      .catch((e) => {
        setNotice(`ファイル監視を開始できませんでした: ${e}`);
      });
    return () => {
      disposed = true;
      unwatch?.();
    };
  }, [projectDir]);

  return <div ref={containerRef} />;
}
