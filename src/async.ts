// 非同期処理の「発射して忘れる」唯一の窓口。
// reject を握りつぶすと watch 不動作・openPath 無反応のような無症状故障になるため、
// 失敗は必ずトーストで可視化する（eslint no-floating-promises と対になる）。
import { useAppStore } from "./store";

export function fireAndReport(p: Promise<unknown>, what: string): void {
  p.catch((e: unknown) => {
    useAppStore.getState().setNotice(`${what}に失敗しました: ${e}`);
  });
}
