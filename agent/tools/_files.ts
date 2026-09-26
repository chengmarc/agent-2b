// Finding files, for the tools that read and search them: Read, Edit, Write, Glob, Grep.
import * as fs from "node:fs";
import * as path from "node:path";

export const MAX_LIST = 200;   // paths / lines returned by Glob and Grep
export const SKIP_DIRS = new Set(["node_modules", "__pycache__", "venv", "dist", "build"]);   // never searched (nor .hidden folders)
export const LINE_PREFIX = /^ *\d+\| ?/gm;   // the number Read puts before each line (Edit strips it if the model copied it)

export function isFile(p: string): boolean {
  return fs.statSync(p, { throwIfNoEntry: false })?.isFile() ?? false;
}

/** Files under dir, skipping hidden folders and SKIP_DIRS; depth 1 = only dir itself. */
export function walkFiles(dir: string, depth = Infinity): string[] {
  const out: string[] = [];
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (depth > 1 && !e.name.startsWith(".") && !SKIP_DIRS.has(e.name)) out.push(...walkFiles(p, depth - 1));
    } else if (e.isFile() || (e.isSymbolicLink() && isFile(p))) {
      out.push(p);
    }
  }
  return out;
}

/** A string as a regular expression that matches it literally. */
export function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
