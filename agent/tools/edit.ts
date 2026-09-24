// Edit: replace an exact snippet in a file, after showing the diff and asking.
import * as fs from "node:fs";
import type { Session } from "./index.ts";
import { SCREEN } from "../terminal.ts";
import { fill, splitLines } from "../text.ts";
import { isFile } from "./_shared.ts";
import { LINE_PREFIX } from "./read.ts";

export const SCHEMA = {
  name: "Edit",
  description: "Replace an exact snippet in a file. `old` must occur exactly once, unless replace_all is true.",
  parameters: { type: "object", properties: {
    path: { type: "string" },
    old: { type: "string" },
    new: { type: "string" },
    replace_all: { type: "boolean", description: "replace every occurrence (default false)" },
  }, required: ["path", "old", "new"] },
};
export const TIP = "change an existing file by exact snippet replacement. `old` must match the file exactly once, including " +
  "indentation; include a few surrounding lines to make it unique. Set replace_all to change every occurrence.";
export const MESSAGES = {
  missing: "Error: {path} does not exist. Use Write to create it.",
  not_found: "Error: `old` was not found in {path}. Re-read the file and copy the snippet exactly.",
  not_once: "Error: `old` found {n} times in {path}; it must match exactly once. Re-read the file and copy the " +
            "snippet exactly, with more surrounding lines, or set replace_all.",
  done: "Edited {path}.",
  done_all: "Edited {path} ({n} replacements).",
};
export const QUIET = true;

export async function run(ag: Session, args: { path: string; old: string; new: string; replace_all?: boolean }): Promise<string> {
  const p = ag.path(args.path);
  let { old, new: updatedPart } = args;
  if (!isFile(p)) return fill(MESSAGES.missing, { path: args.path });
  const text = fs.readFileSync(p).toString("utf8");
  if (!text.includes(old) && old.search(LINE_PREFIX) >= 0) {   // the model copied Read's "   12| " prefixes
    old = old.replace(LINE_PREFIX, "");
    updatedPart = updatedPart.replace(LINE_PREFIX, "");
  }
  if (!text.includes(old) && text.includes("\r\n")) {   // the model writes \n; the file may be CRLF
    old = old.replaceAll("\r\n", "\n").replaceAll("\n", "\r\n");
    updatedPart = updatedPart.replaceAll("\r\n", "\n").replaceAll("\n", "\r\n");
  }
  const n = old ? text.split(old).length - 1 : 0;
  if (n === 0) return fill(MESSAGES.not_found, { path: args.path });
  if (n > 1 && !args.replace_all) return fill(MESSAGES.not_once, { n, path: args.path });
  const updated = text.split(old).join(updatedPart);
  SCREEN.diff(splitLines(text), splitLines(updated));
  const denied = await ag.confirm(`edit ${args.path}`);
  if (denied) return denied;
  fs.writeFileSync(p, updated, "utf8");
  return n > 1 ? fill(MESSAGES.done_all, { path: args.path, n }) : fill(MESSAGES.done, { path: args.path });
}
