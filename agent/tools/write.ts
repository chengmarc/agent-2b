// Write: create or overwrite a file, after showing the diff and asking.
import * as fs from "node:fs";
import * as path from "node:path";
import type { Session } from "./index.ts";
import { DIM, SCREEN } from "../terminal.ts";
import { fill, splitLines } from "../text.ts";
import { isFile } from "./_shared.ts";

export const SCHEMA = {
  name: "Write",
  description: "Create a file, or overwrite it with the full new content.",
  parameters: { type: "object", properties: {
    path: { type: "string" },
    content: { type: "string" },
  }, required: ["path", "content"] },
};
export const TIP = "create new files, or fully rewrite very small ones.";
export const MESSAGES = {
  done: "Wrote {path} ({lines} lines).",
};
export const QUIET = true;

export async function run(ag: Session, args: { path: string; content: string }): Promise<string> {
  const p = ag.path(args.path), lines = splitLines(args.content);
  const before = isFile(p) ? fs.readFileSync(p, "utf8") : "";
  if (before) SCREEN.diff(splitLines(before), lines);
  else SCREEN.detail([[DIM, `new file (${lines.length} lines)`]]);
  const denied = await ag.confirm(`write ${args.path}`);
  if (denied) return denied;
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, args.content, "utf8");
  return fill(MESSAGES.done, { path: args.path, lines: lines.length });
}
