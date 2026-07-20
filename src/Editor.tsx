import { useEffect, useRef } from "react";
import { Annotation, Compartment, EditorState } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { watch } from "@tauri-apps/plugin-fs";
import { atomicSave, contentHash, diskHash, loadFile, readFileRaw } from "./fileio";
import { fireAndReport } from "./async";
import { useAppStore } from "./store";
import { derive } from "./parsers/derive";
import { semiWysiwyg } from "./decorations";
import { paperTheme, zoomTheme } from "./editorTheme";
import { ZOOM_STEP } from "./store";

const DERIVE_DEBOUNCE_MS = 150; // SPEC §5.6

// 選択範囲の字数（空白を除く符号点数。charCount と同じ数え方）
function selectionCount(state: EditorState): number {
  let n = 0;
  for (const r of state.selection.ranges) {
    if (r.empty) continue;
    n += [...state.sliceDoc(r.from, r.to).replace(/\s/g, "")].length;
  }
  return n;
}

// プログラム起因のバッファ置換（読込・外部変更の再読込）を編集と区別するための注釈。
// これが付いたトランザクションでは dirty 化・自動保存予約をしない。
const ProgrammaticLoad = Annotation.define<boolean>();

const AUTOSAVE_IDLE_MS = 2000;

export function Editor() {
  const projectDir = useAppStore((s) => s.projectDir);
  const currentPath = useAppStore((s) => s.currentPath);
  const setSaveStatus = useAppStore((s) => s.setSaveStatus);
  const setNotice = useAppStore((s) => s.setNotice);
  const setView = useAppStore((s) => s.setView);
  const setDerived = useAppStore((s) => s.setDerived);
  const setMirrorText = useAppStore((s) => s.setMirrorText);
  const setSelCount = useAppStore((s) => s.setSelCount);
  const setZoom = useAppStore((s) => s.setZoom);
  const zoom = useAppStore((s) => s.zoom);

  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const loadedPathRef = useRef<string | null>(null);
  const dirtyRef = useRef(false);
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const deriveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savingRef = useRef(false);
  const zoomCompartment = useRef(new Compartment());
  // wheel ハンドラから最新の zoom を参照するための鏡（リスナ再登録を避ける）
  const zoomRef = useRef(zoom);

  // 読み取り専用：doc から派生情報（目次・マーカー・脚注・字数）を再計算してストアへ。
  // IME・入力・keymap・装飾には一切関与しない（§5.6）。
  const scheduleDerive = () => {
    if (deriveTimerRef.current) clearTimeout(deriveTimerRef.current);
    deriveTimerRef.current = setTimeout(() => {
      const view = viewRef.current;
      if (!view) return;
      const text = view.state.doc.toString();
      setDerived(derive(text));
      // FR25: 2窓が有効なときだけ参照ペインへ本文の写しを流す（読み取りのみ＝dirty化しない）。
      // splitView は非リアクティブに読む（このコールバックの再生成を避ける）。
      if (useAppStore.getState().splitView) setMirrorText(text);
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
          zoomCompartment.current.of(zoomTheme(zoomRef.current)),
          semiWysiwyg(),
          EditorView.updateListener.of((u) => {
            // 選択字数は選択変更・doc変更どちらでも更新（読み取りのみ＝dirty化しない）
            if (u.selectionSet || u.docChanged) {
              setSelCount(selectionCount(u.state));
            }
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

  // ズーム倍率の変更を本文フォントに反映（Compartment 差し替え。doc には触れないので
  // dirty化・自動保存・派生更新のいずれもトリガーしない。カーソル・IME状態も保持される）
  useEffect(() => {
    zoomRef.current = zoom;
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: zoomCompartment.current.reconfigure(zoomTheme(zoom)),
    });
  }, [zoom]);

  // Ctrl（macは⌘）+ スクロールでズーム。WebView標準ズームを抑止する。
  // compositionにもkeymapにも触れないため IME 規約に抵触しない。
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      if (e.deltaY === 0) return;
      const dir = e.deltaY < 0 ? 1 : -1; // 上スクロールで拡大
      setZoom(zoomRef.current + dir * ZOOM_STEP);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [setZoom]);

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
