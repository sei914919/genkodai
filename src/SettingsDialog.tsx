import { useState } from "react";
import { BIN_NAMES, resolveBins, saveSettings, type BinName } from "./binPaths";
import { examplePath, isMac } from "./platform";
import { useAppStore } from "./store";
import styles from "./SettingsDialog.module.css";

// §5.8-2: 解決に失敗したバイナリの絶対パスを手動指定する最小ダイアログ。
// 指定値は Tauri app config 領域に保存する（プロジェクトには書かない）。
export function SettingsDialog() {
  const open = useAppStore((s) => s.settingsOpen);
  const bins = useAppStore((s) => s.bins);
  const settings = useAppStore((s) => s.settings);
  const shell = useAppStore((s) => s.shell);
  const shellResolved = useAppStore((s) => s.shellResolved);
  const setSettingsOpen = useAppStore((s) => s.setSettingsOpen);
  const setBins = useAppStore((s) => s.setBins);
  const setNotice = useAppStore((s) => s.setNotice);

  const [draft, setDraft] = useState<Partial<Record<BinName, string>>>(
    settings.manualPaths,
  );
  const [busy, setBusy] = useState(false);

  if (!open) return null;

  const apply = async () => {
    setBusy(true);
    try {
      const next = { manualPaths: draft };
      await saveSettings(next);
      const resolved = await resolveBins(next);
      setBins(resolved, next);
      const missing = BIN_NAMES.filter((n) => !resolved[n]);
      setNotice(
        missing.length === 0
          ? "すべての外部コマンドを解決しました"
          : `未解決: ${missing.join(", ")}（パスを確認してください）`,
      );
      setSettingsOpen(false);
    } catch (e) {
      setNotice(`設定の保存に失敗しました: ${e}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.backdrop} onClick={() => setSettingsOpen(false)}>
      <div className={styles.dialog} onClick={(e) => e.stopPropagation()}>
        <div className={styles.title}>外部コマンドのパス</div>
        <p className={styles.desc}>
          ファイラ／デスクトップから起動したアプリはシェルのPATHを引き継がないため、
          見つからないコマンドは絶対パスを指定してください（例:
          <code>{examplePath("quarto")}</code>）。空欄なら自動解決の結果を使います。
        </p>

        {/* 解決に使ったシェルを明示する。-lc が読むプロファイルはシェルで違う
            （bash は ~/.bashrc を読まない）ため、解決漏れの原因究明にはシェル名が要る。 */}
        <div className={styles.shellLine} data-ok={!!shell}>
          {shell ? (
            <>
              解決に使ったシェル: <code>{shell.path}</code>（{shell.name}）
            </>
          ) : shellResolved ? (
            <>利用可能なシェルが見つかりませんでした（/bin/bash・/bin/zsh のいずれも不在）。下の各コマンドに絶対パスを指定してください。</>
          ) : (
            <>シェルを探索中…</>
          )}
        </div>

        {BIN_NAMES.map((name) => (
          <div key={name} className={styles.row}>
            <div className={styles.rowHead}>
              <span className={styles.name}>{name}</span>
              <span className={styles.state} data-ok={!!bins[name]}>
                {bins[name] ? "解決済み" : "未解決"}
              </span>
            </div>
            <div className={styles.resolved}>{bins[name] ?? "—"}</div>
            {!bins[name] && shell && !draft[name]?.trim() && (
              <div className={styles.reason}>
                {shell.path} のログインシェル環境では見つかりませんでした。設定で絶対パスを指定してください。
              </div>
            )}
            <input
              className={styles.input}
              value={draft[name] ?? ""}
              placeholder="絶対パスを手動指定（空欄=自動解決）"
              onChange={(e) =>
                setDraft((d) => ({ ...d, [name]: e.target.value }))
              }
              spellCheck={false}
            />
          </div>
        ))}

        <div className={styles.templateNote}>
          <div className={styles.templateTitle}>新規プロジェクトのテンプレート</div>
          新規プロジェクトの雛形は下記フォルダの複製です。中身を直接編集すれば、
          自分の書き出し方に育てられます（初回起動時に既定を書き出します）。
          <div className={styles.templatePath}>
            {isMac()
              ? "~/Library/Application Support/com.sei.genkodai/templates/default/"
              : "~/.config/com.sei.genkodai/templates/default/"}
          </div>
        </div>

        <div className={styles.actions}>
          <button
            className={styles.cancel}
            onClick={() => setSettingsOpen(false)}
            disabled={busy}
          >
            閉じる
          </button>
          <button className={styles.apply} onClick={apply} disabled={busy}>
            {busy ? "確認中…" : "保存して再解決"}
          </button>
        </div>
      </div>
    </div>
  );
}
