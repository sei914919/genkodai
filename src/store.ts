import { create } from "zustand";

export type SaveStatus = "clean" | "dirty" | "saving";

interface AppState {
  projectDir: string | null;
  qmdFiles: string[];
  currentPath: string | null;
  saveStatus: SaveStatus;
  notice: string | null;
  openProject: (dir: string, files: string[]) => void;
  setCurrentPath: (path: string | null) => void;
  setSaveStatus: (s: SaveStatus) => void;
  setNotice: (msg: string | null) => void;
}

export const useAppStore = create<AppState>((set) => ({
  projectDir: null,
  qmdFiles: [],
  currentPath: null,
  saveStatus: "clean",
  notice: null,
  openProject: (dir, files) =>
    set({
      projectDir: dir,
      qmdFiles: files,
      currentPath: files[0] ?? null,
      saveStatus: "clean",
      notice: null,
    }),
  setCurrentPath: (path) => set({ currentPath: path }),
  setSaveStatus: (s) => set({ saveStatus: s }),
  setNotice: (msg) => set({ notice: msg }),
}));
