import { create } from "zustand";
import type { EditorView } from "@codemirror/view";
import type { Derived } from "./parsers/derive";
import type { BibEntry } from "./parsers/bibtex";
import type { ParsedNoteFile } from "./parsers/notes";
import type { BinPaths, Settings } from "./binPaths";
import type { ShellInfo } from "./shell";
import type { FillProposal } from "./proposalValidate";
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

// Claude一括穴埋め（FR16）の進行状態。ログはパネル内表示のみ（監査用・ファイルには書かない）
export type FillPhase = "idle" | "precommit" | "running" | "review" | "applying";

export interface FillState {
  phase: FillPhase;
  proposals: FillProposal[];
  warnings: string[];
  prompt: string;
  rawResponse: string;
  message: string | null; // タイムアウト・キャンセル・エラー等の表示
}

export const FILL_IDLE: FillState = {
  phase: "idle",
  proposals: [],
  warnings: [],
  prompt: "",
  rawResponse: "",
  message: null,
};

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
  // 外部実行に使うシェル（起動時に探索）。null = 利用可能なシェルが無い
  shell: ShellInfo | null;
  shellResolved: boolean;
  settingsOpen: boolean;
  git: GitState;
  render: RenderState;
  integrityReport: string | null;
  fill: FillState;

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
  setShell: (shell: ShellInfo | null) => void;
  setSettingsOpen: (open: boolean) => void;
  setGit: (g: GitState) => void;
  setRender: (r: Partial<RenderState>) => void;
  setIntegrityReport: (r: string | null) => void;
  setFill: (f: Partial<FillState>) => void;
  resetFill: () => void;
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
  shell: null,
  shellResolved: false,
  settingsOpen: false,
  git: NOT_A_REPO,
  render: { running: false, ok: null, log: "", outputPath: null },
  integrityReport: null,
  fill: FILL_IDLE,

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
      fill: FILL_IDLE,
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
  setShell: (shell) => set({ shell, shellResolved: true }),
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
  setGit: (git) => set({ git }),
  setRender: (r) => set((s) => ({ render: { ...s.render, ...r } })),
  setIntegrityReport: (integrityReport) => set({ integrityReport }),
  setFill: (f) => set((s) => ({ fill: { ...s.fill, ...f } })),
  resetFill: () => set({ fill: FILL_IDLE }),
}));
