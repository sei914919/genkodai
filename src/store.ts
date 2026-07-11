import { create } from "zustand";
import type { EditorView } from "@codemirror/view";
import type { Derived } from "./parsers/derive";
import type { BibEntry } from "./parsers/bibtex";
import type { ParsedNoteFile } from "./parsers/notes";
import type { BinPaths, Settings } from "./binPaths";
import { NOT_A_REPO, type GitState } from "./git";

export type SaveStatus = "clean" | "dirty" | "saving";
export type RightTab = "notes" | "refs" | "fn";

// レンダー・整合チェックの結果表示（パネル内。ファイルには書かない）
export interface RenderState {
  running: boolean;
  ok: boolean | null;
  log: string;
  outputPath: string | null;
}

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

  // Phase 2: 外部バイナリ・git・レンダー（§5.8 / FR18-20）
  bins: BinPaths;
  settings: Settings;
  binsResolved: boolean;
  settingsOpen: boolean;
  git: GitState;
  render: RenderState;
  integrityReport: string | null;

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

  setBins: (bins: BinPaths, settings: Settings) => void;
  setSettingsOpen: (open: boolean) => void;
  setGit: (g: GitState) => void;
  setRender: (r: Partial<RenderState>) => void;
  setIntegrityReport: (r: string | null) => void;
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

  bins: { claude: null, quarto: null, git: null },
  settings: { manualPaths: {} },
  binsResolved: false,
  settingsOpen: false,
  git: NOT_A_REPO,
  render: { running: false, ok: null, log: "", outputPath: null },
  integrityReport: null,

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
      git: NOT_A_REPO,
      render: { running: false, ok: null, log: "", outputPath: null },
      integrityReport: null,
    }),
  setCurrentPath: (path) => set({ currentPath: path, selectedMarkerIdx: null }),
  setSaveStatus: (s) => set({ saveStatus: s }),
  setNotice: (msg) => set({ notice: msg }),
  setView: (v) => set({ view: v }),
  setDerived: (d) => set({ derived: d }),
  setNotesData: (notes, refs, bibErrors, orphanKeys) =>
    set({ notes, refs, bibErrors, orphanKeys }),
  setRightTab: (t) => set({ rightTab: t }),
  selectMarker: (idx) => set({ selectedMarkerIdx: idx, rightTab: "notes" }),

  setBins: (bins, settings) => set({ bins, settings, binsResolved: true }),
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
  setGit: (git) => set({ git }),
  setRender: (r) => set((s) => ({ render: { ...s.render, ...r } })),
  setIntegrityReport: (integrityReport) => set({ integrityReport }),
}));
