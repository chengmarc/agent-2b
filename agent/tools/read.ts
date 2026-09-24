// Read: a text file, as numbered lines.
import * as fs from "node:fs";
import type { Session } from "./index.ts";
import { fill, splitLines } from "../text.ts";
import { int, isFile } from "./_shared.ts";

const LIMIT = 400;   // lines per call, unless the model asks for another limit
export const LINE_PREFIX = /^ *\d+\| ?/gm;   // the number Read puts before each line

export const SCHEMA = {
  name: "Read",
  description: "Read a text file; returns numbered lines.",
  parameters: { type: "object", properties: {
    path: { type: "string", description: "relative to the project, or absolute (anywhere on this computer)" },
    offset: { type: "integer", description: "1-based first line" },
    limit: { type: "integer", description: `max lines (default ${LIMIT})` },
  }, required: ["path"] },
};
export const TIP = "read a file before you edit it. Read only the parts you need (offset, limit).";
export const MESSAGES = {
  not_a_file: "Error: {path} is not a file.",
  empty: "(empty file)",
  more_lines: "\n... {rest} more lines (use offset={next})",
};

export async function run(ag: Session, args: { path: string; offset?: number; limit?: number }): Promise<string> {
  const p = ag.path(args.path);
  if (!isFile(p)) return fill(MESSAGES.not_a_file, { path: args.path });
  const lines = splitLines(fs.readFileSync(p, "utf8"));
  const offset = Math.max(1, int(args.offset, 1)), limit = int(args.limit, LIMIT);
  const chunk = lines.slice(offset - 1, offset - 1 + limit);
  const out = chunk.map((l, i) => `${String(offset + i).padStart(5)}| ${l}`).join("\n");
  const rest = lines.length - (offset - 1 + chunk.length);
  const more = rest > 0 ? fill(MESSAGES.more_lines, { rest, next: offset + chunk.length }) : "";
  return (out || MESSAGES.empty) + more;
}
