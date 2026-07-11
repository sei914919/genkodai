import { create } from "zustand";
import type { EditorView } from "@codemirror/view";
import type { Derived } from "./parsers/derive";
import type { BibEntry } from "./parsers/bibtex";
import type { ParsedNoteFile } from "./parsers/notes";

export type SaveStatus = "clean" | "dirty" | "saving";
export type RightTab = "notes" | "refs" | "fn";

const EMPTY_DERIVED: Derived = {
  headings: [],
  markers: [],
  footnotes: [],
  charCount: 0,
};

interface AppState {
  projectDir: string | null;
  qmdFiles: string[];
  currentPath: string | null;
  saveStatus: SaveStatus;
  notice: string | null;

  // エディタ由来の派生情報（FR7/9/10/13）
  view: EditorView | null;
  derived: Derived;

  // 右パネル資源（FR11/12）
  notes: ParsedNoteFile[];
  refs: BibEntry[];
  bibErrors: string[];
  orphanKeys: string[]; // notes/ が参照するが refs.bib に無いキー

  // 右パネルの状態
  rightTab: RightTab;
  selectedMarkerIdx: number | null; // 照合モード対象（FR10/14）

  openProject: (dir: string, files: string[]) => void;
  setCurrentPath: (path: string | null) => void;
  setSaveStatus: (s: SaveStatus) => void;
  setNotice: (msg: string | null) => void;
  setView: (v: EditorView | null) => void;
  setDerived: (d: Derived) => void;
  setNotesData: (
    notes: ParsedNoteFile[],
    refs: BibEntry[],
    bibErrors: string[],
    orphanKeys: string[],
  ) => void;
  setRightTab: (t: RightTab) => void;
  selectMarker: (idx: number | null) => void;
}

export const useAppStore = create<AppState>((set) => ({
  projectDir: null,
  qmdFiles: [],
  currentPath: null,
  saveStatus: "clean",
  notice: null,

  view: null,
  derived: EMPTY_DERIVED,

  notes: [],
  refs: [],
  bibErrors: [],
  orphanKeys: [],

  rightTab: "notes",
  selectedMarkerIdx: null,

  openProject: (dir, files) =>
    set({
      projectDir: dir,
      qmdFiles: files,
      currentPath: files[0] ?? null,
      saveStatus: "clean",
      notice: null,
      selectedMarkerIdx: null,
      derived: EMPTY_DERIVED,
      notes: [],
      refs: [],
      bibErrors: [],
      orphanKeys: [],
    }),
  setCurrentPath: (path) => set({ currentPath: path, selectedMarkerIdx: null }),
  setSaveStatus: (s) => set({ saveStatus: s }),
  setNotice: (msg) => set({ notice: msg }),
  setView: (v) => set({ view: v }),
  setDerived: (d) => set({ derived: d }),
  setNotesData: (notes, refs, bibErrors, orphanKeys) =>
    set({ notes, refs, bibErrors, orphanKeys }),
  setRightTab: (t) => set({ rightTab: t }),
  selectMarker: (idx) =>
    set({ selectedMarkerIdx: idx, rightTab: idx === null ? "notes" : "notes" }),
}));
