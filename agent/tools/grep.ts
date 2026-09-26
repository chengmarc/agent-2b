// Grep: search file contents with a regular expression.
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import type { Session } from "./_types.ts";
import { fill, splitLines } from "../text.ts";
import { int } from "./_args.ts";
import { escapeRegExp, isFile, MAX_LIST, walkFiles } from "./_files.ts";

export const SCHEMA = {
  name: "Grep",
  description: "Search file contents with a regular expression (JavaScript syntax). Returns matching files, " +
               "or matching lines with output_mode=content.",
  parameters: { type: "object", properties: {
    pattern: { type: "string" },
    path: { type: "string", description: "file or folder to search: relative to the project, or absolute (anywhere on this computer); default: project root" },
    glob: { type: "string", description: "only search files matching this name pattern, e.g. *.py" },
    ignore_case: { type: "boolean" },
    output_mode: { type: "string", enum: ["files", "content"], description: "files (default) or content: path:line: text" },
    context: { type: "integer", description: "lines of context around each match (content mode)" },
  }, required: ["pattern"] },
};
export const TIP = "search file contents with a regex. Use it instead of grep or find in Bash.";
export const MESSAGES = {
  as_text: "(Not a valid regular expression ({error}); searched for it as plain text.)\n",
  none: "No matches for {pattern}.",
  more: "\n... {more} more (narrow the search with path or glob)",
};

/** Files to search under base: git's list (tracked + untracked, minus .gitignore'd) when base is
 *  in a git repo, otherwise a walk that skips hidden folders and dependency/build folders. */
function filesUnder(base: string): string[] {
  if (isFile(base)) return [base];
  const r = spawnSync("git", ["ls-files", "-co", "--exclude-standard", "-z"],
                      { cwd: base, encoding: "utf8", timeout: 30_000, maxBuffer: 256 * 1024 * 1024, windowsHide: true });
  if (!r.error && r.status === 0) {
    return r.stdout.split("\0").filter(Boolean).map(f => path.join(base, f)).filter(isFile);
  }
  return walkFiles(base);
}

/** Shell-style name matching, like Python's fnmatch: * and ? match any character, including /. */
function fnmatch(name: string, pattern: string): boolean {
  let re = "";
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === "*") re += ".*";
    else if (c === "?") re += ".";
    else if (c === "[" && pattern.indexOf("]", i + 2) > 0) {
      const end = pattern.indexOf("]", i + 2), set = pattern.slice(i + 1, end);
      re += "[" + (set[0] === "!" ? "^" + set.slice(1) : set).replaceAll("\\", "\\\\") + "]";
      i = end;
    } else re += escapeRegExp(c);
  }
  return new RegExp(`^${re}$`, "is").test(name);   // Windows file names ignore case
}

export async function run(ag: Session, args: {
  pattern: string; path?: string; glob?: string; ignore_case?: boolean; output_mode?: string; context?: number;
}): Promise<string> {
  const { pattern, glob } = args;
  const flags = args.ignore_case ? "i" : "";
  let rx: RegExp, note = "";
  try {
    rx = new RegExp(pattern, flags);
  } catch (e) {   // small models often write the literal text (e.g. "sub("): search for that instead
    rx = new RegExp(escapeRegExp(pattern), flags);
    note = fill(MESSAGES.as_text, { error: (e as Error).message });
  }
  const base = ag.path(args.path || "."), context = Math.max(0, int(args.context, 0)), out: string[] = [];
  for (const f of filesUnder(base)) {
    const name = ag.rel(f);
    if (glob && !(fnmatch(path.basename(f), glob.replace(/^\*\*\//, "")) || fnmatch(name, glob))) continue;
    let data: Buffer;
    try {
      data = fs.readFileSync(f);
    } catch {
      continue;
    }
    if (data.length > 2_000_000 || data.subarray(0, 8000).includes(0)) continue;   // skip big and binary files
    const lines = splitLines(data.toString("utf8"));
    const hits = new Set(lines.flatMap((l, i) => (rx.test(l) ? [i] : [])));
    if (!hits.size) continue;
    if (args.output_mode !== "content") {
      out.push(name);
      continue;
    }
    const shown = new Set<number>();
    for (const i of hits)
      for (let j = Math.max(0, i - context); j < Math.min(lines.length, i + context + 1); j++) shown.add(j);
    const sorted = [...shown].sort((a, b) => a - b);
    sorted.forEach((j, k) => {
      if (context && k && j !== sorted[k - 1] + 1) out.push("--");
      out.push(`${name}:${j + 1}${hits.has(j) ? ":" : "-"} ${lines[j].slice(0, 300)}`);
    });
  }
  if (!out.length) return note + fill(MESSAGES.none, { pattern });
  const more = out.length > MAX_LIST ? fill(MESSAGES.more, { more: out.length - MAX_LIST }) : "";
  return note + out.slice(0, MAX_LIST).join("\n") + more;
}
