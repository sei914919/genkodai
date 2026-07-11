import { exists, readDir, readTextFile } from "@tauri-apps/plugin-fs";
import { parseBibtex, type BibEntry } from "./parsers/bibtex";
import {
  collectKeys,
  parseNotesFile,
  type ParsedNoteFile,
} from "./parsers/notes";

export interface ProjectResources {
  notes: ParsedNoteFile[];
  refs: BibEntry[];
  bibErrors: string[];
  orphanKeys: string[]; // notes/ が参照するが refs.bib に無いキー（FR12）
}

export async function loadResources(dir: string): Promise<ProjectResources> {
  const notes = await loadNotes(dir);
  const { refs, bibErrors } = await loadRefs(dir);
  const refKeys = new Set(refs.map((r) => r.key));
  const orphanKeys = collectKeys(notes)
    .filter((k) => !refKeys.has(k))
    .sort();
  return { notes, refs, bibErrors, orphanKeys };
}

async function loadNotes(dir: string): Promise<ParsedNoteFile[]> {
  const notesDir = `${dir}/notes`;
  if (!(await exists(notesDir))) return [];
  const entries = await readDir(notesDir);
  const files = entries
    .filter((e) => e.isFile && e.name.endsWith(".md"))
    .map((e) => e.name)
    .sort();
  const out: ParsedNoteFile[] = [];
  for (const name of files) {
    const content = await readTextFile(`${notesDir}/${name}`);
    out.push(parseNotesFile(`notes/${name}`, content));
  }
  return out;
}

async function loadRefs(
  dir: string,
): Promise<{ refs: BibEntry[]; bibErrors: string[] }> {
  const bibPath = `${dir}/refs.bib`;
  if (!(await exists(bibPath))) return { refs: [], bibErrors: [] };
  const content = await readTextFile(bibPath);
  const { entries, errors } = parseBibtex(content);
  return { refs: entries, bibErrors: errors };
}
