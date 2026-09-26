// Glob: find files by name pattern, newest first.
import * as fs from "node:fs";
import * as path from "node:path";
import type { Session } from "./index.ts";
import { fill } from "../text.ts";
import { escapeRegExp, MAX_LIST, walkFiles } from "./_files.ts";

export const SCHEMA = {
  name: "Glob",
  description: "Find files by name pattern, e.g. **/*.py or src/**/test_*.js. Returns paths, newest first.",
  parameters: { type: "object", properties: {
    pattern: { type: "string" },
    path: { type: "string", description: "folder to search: relative to the project, or absolute (anywhere on this computer); default: project root" },
  }, required: ["pattern"] },
};
export const TIP = "find files by name, e.g. `**/*.py`.";
export const MESSAGES = {
  none: "No files match {pattern}.",
  more: "\n... {more} more (use a narrower pattern)",
};

/** A path pattern as a regular expression: ** crosses folders, * and ? stay within one name. */
function patternRegExp(pattern: string): RegExp {
  let re = "";
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (pattern.startsWith("**/", i)) { re += "(?:.*/)?"; i += 2; }
    else if (pattern.startsWith("**", i)) { re += ".*"; i += 1; }
    else if (c === "*") re += "[^/]*";
    else if (c === "?") re += "[^/]";
    else if (c === "[" && pattern.indexOf("]", i + 2) > 0) {
      const end = pattern.indexOf("]", i + 2), set = pattern.slice(i + 1, end);
      re += "[" + (set[0] === "!" ? "^" + set.slice(1) : set).replaceAll("\\", "\\\\") + "]";
      i = end;
    } else re += escapeRegExp(c);
  }
  return new RegExp(`^${re}$`, process.platform === "win32" ? "i" : "");   // Windows file names ignore case
}

export async function run(ag: Session, args: { pattern: string; path?: string }): Promise<string> {
  const base = ag.path(args.path || ".");
  const pattern = args.pattern.replaceAll("\\", "/").replace(/^(\.\/)+/, "");
  const rx = patternRegExp(pattern);
  const depth = pattern.includes("**") ? Infinity : pattern.split("/").length;
  const found = walkFiles(base, depth).filter(p => rx.test(path.relative(base, p).replaceAll("\\", "/")));
  if (!found.length) return fill(MESSAGES.none, { pattern: args.pattern });
  const mtime = new Map(found.map(p => [p, fs.statSync(p).mtimeMs]));
  found.sort((a, b) => mtime.get(b)! - mtime.get(a)!);
  const out = found.slice(0, MAX_LIST).map(p => ag.rel(p)).join("\n");
  return out + (found.length > MAX_LIST ? fill(MESSAGES.more, { more: found.length - MAX_LIST }) : "");
}
