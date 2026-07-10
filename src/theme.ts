// 配色・書体トークンの一元管理（design/writing_studio_mockup.jsx の C / FONT_* を移植）
// 朱＝校正・未充填、藍＝確定した引用・脚注番号

export const C = {
  chrome: "#F5F2EA",
  rail: "#F0EDE3",
  page: "#FDFCF8",
  ink: "#26231E",
  sub: "#7A7468",
  faint: "#A9A395",
  line: "#E4E0D4",
  lineStrong: "#D4CFC0",
  shu: "#B4392A",
  shuBg: "#F9EBE7",
  shuLine: "#E5BDB4",
  ai: "#35567D",
  aiBg: "#EDF2F8",
  aiLine: "#C2D1E2",
  ok: "#4A6B3A",
  okBg: "#EFF3E9",
} as const;

export const FONT_UI =
  "'Zen Kaku Gothic New','Hiragino Kaku Gothic ProN',sans-serif";
export const FONT_MS =
  "'Shippori Mincho','Hiragino Mincho ProN',serif";
export const FONT_MONO = "'SF Mono',Menlo,Consolas,monospace";

// CSS Modules から var(--c-*) / var(--font-*) で参照できるように注入する
export function injectThemeVars(): void {
  const root = document.documentElement;
  for (const [key, value] of Object.entries(C)) {
    root.style.setProperty(`--c-${key}`, value);
  }
  root.style.setProperty("--font-ui", FONT_UI);
  root.style.setProperty("--font-ms", FONT_MS);
  root.style.setProperty("--font-mono", FONT_MONO);
}
