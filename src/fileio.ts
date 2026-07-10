import { readDir, readTextFile, rename, writeTextFile } from "@tauri-apps/plugin-fs";

// ---- ディスク内容ハッシュ（§5.7 自己保存イベントの識別に使用） ----
// 自分の保存内容と一致するかの判定用途なので暗号強度は不要。FNV-1a 32bit ×2版。
export function contentHash(text: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ ((c >> 8) ^ (h2 >>> 24)), 0x01000193) >>> 0;
  }
  return `${h1.toString(16)}-${h2.toString(16)}-${text.length}`;
}

// パスごとの「アプリが最後に把握したディスク内容」のハッシュ。
// 読込時と保存成功時に更新する。watchイベント受信時にこれと一致すれば自己保存とみなす。
export const diskHash = new Map<string, string>();

// diskHash を更新しない素の読み取り（watchイベントの外部変更判定用）
export async function readFileRaw(path: string): Promise<string> {
  return readTextFile(path);
}

export async function loadFile(path: string): Promise<string> {
  const text = await readTextFile(path);
  diskHash.set(path, contentHash(text));
  return text;
}

// 絶対規則1：アトミック保存。tmpに書いて rename。直接上書きしない。
export async function atomicSave(path: string, content: string): Promise<void> {
  const tmp = `${path}.tmp-save`;
  await writeTextFile(tmp, content);
  await rename(tmp, path);
  diskHash.set(path, contentHash(content));
}

export async function listQmdFiles(dir: string): Promise<string[]> {
  const entries = await readDir(dir);
  return entries
    .filter((e) => e.isFile && e.name.endsWith(".qmd"))
    .map((e) => `${dir}/${e.name}`)
    .sort();
}

export function baseName(path: string): string {
  return path.split("/").pop() ?? path;
}
