// OS判定は「表示（cosmetic）」専用。機能分岐には使わない。
// 外部プロセスのシェル選択は OS ではなくシェルの実在で決める（shell.ts）。
// ここで判定するのは修飾キーの表記（Cmd/Ctrl）と例示パスだけ。
//
// 依存を増やさないため plugin-os は使わず、webview の userAgent で判定する。

export function isMac(ua: string = navigator.userAgent): boolean {
  return /Mac|iPhone|iPad|iPod/.test(ua);
}

// 修飾キーの表記。実キーバインドは Mod-/metaKey||ctrlKey で両対応済み（表示のみ）。
export function modKey(ua: string = navigator.userAgent): string {
  return isMac(ua) ? "Cmd" : "Ctrl";
}

// 手動パス指定ダイアログの例示パス（mac は Homebrew、Linux は /usr/local/bin）。
export function examplePath(bin: string, ua: string = navigator.userAgent): string {
  return isMac(ua) ? `/opt/homebrew/bin/${bin}` : `/usr/local/bin/${bin}`;
}
