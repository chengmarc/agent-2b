// Code and texts used by more than one tool.
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import type { Session } from "./index.ts";
import { fill } from "../text.ts";

// ---- files: Read, Edit, Write, Glob, Grep ----
export const MAX_LIST = 200;   // paths / lines returned by Glob and Grep
export const SKIP_DIRS = new Set(["node_modules", "__pycache__", "venv", "dist", "build"]);   // never searched (nor .hidden folders)

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

/** A whole number from a tool argument; missing, empty or 0 means the default. */
export function int(v: unknown, dflt: number): number {
  if (v === undefined || v === null || v === "" || v === 0) return dflt;
  const n = Number(v);
  if (!Number.isFinite(n)) throw new TypeError(`not a number: ${JSON.stringify(v)}`);
  return Math.trunc(n);
}

// ---- commands: Bash, PowerShell, Git, GitHub ----
export const COMMAND_TIMEOUT = 180;   // seconds
// No pagers, colors or interactive prompts in commands the agent runs (they would hang or clutter output).
const QUIET = { GIT_PAGER: "cat", PAGER: "cat", GH_PAGER: "", NO_COLOR: "1",
                GH_PROMPT_DISABLED: "1", GIT_TERMINAL_PROMPT: "0" };
export const MESSAGES = {
  command_timeout: "Error: command timed out after {seconds} s.",
  command_output: "{output}\n[exit code {code}]",
  command_no_output: "[no output, exit code {code}]",
};

export async function runCommand(ag: Session, argv: string[], ask = true): Promise<string> {
  if (ask) {
    const denied = await ag.confirm("this command");
    if (denied) return denied;
  }
  const r = spawnSync(argv[0], argv.slice(1), {
    cwd: ag.root, encoding: "utf8", timeout: COMMAND_TIMEOUT * 1000, stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, ...QUIET }, maxBuffer: 64 * 1024 * 1024, windowsHide: true,
  });
  if ((r.error as NodeJS.ErrnoException | undefined)?.code === "ETIMEDOUT") {
    return fill(MESSAGES.command_timeout, { seconds: COMMAND_TIMEOUT });
  }
  if (r.error) throw r.error;
  const code = r.status ?? r.signal;
  const out = (r.stdout + (r.stderr ? "\n" + r.stderr : "")).trimEnd().replace(/^\n+/, "");   // keep leading spaces (git status)
  return out ? fill(MESSAGES.command_output, { output: out, code }) : fill(MESSAGES.command_no_output, { code });
}

/** Words of a command line, like Python's shlex.split: quotes and backslashes as in a POSIX shell. */
export function shlexSplit(s: string): string[] {
  const words: string[] = [];
  let word = "", inWord = false, quote = "";
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quote === "'") {
      if (c === "'") quote = ""; else word += c;
    } else if (quote === '"') {
      if (c === '"') quote = "";
      else if (c === "\\" && (s[i + 1] === '"' || s[i + 1] === "\\")) word += s[++i];
      else word += c;
    } else if (c === "'" || c === '"') {
      quote = c;
      inWord = true;
    } else if (c === "\\") {
      if (i + 1 >= s.length) throw new SyntaxError("No escaped character");
      word += s[++i];
      inWord = true;
    } else if (/\s/.test(c)) {
      if (inWord) words.push(word);
      word = "";
      inWord = false;
    } else {
      word += c;
      inWord = true;
    }
  }
  if (quote) throw new SyntaxError("No closing quotation");
  if (inWord) words.push(word);
  return words;
}

// ---- web: WebSearch, WebFetch ----
// fetch uses the proxy in HTTPS_PROXY, or the Windows proxy (e.g. Clash): see proxy.ts.
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36";

export class HttpError extends Error {
  constructor(status: number, statusText: string) {
    super(`HTTP ${status} ${statusText}`);
  }
}

/** [final url, content type, decoded text] of a web page (at most 5 MB of it). */
export async function webGet(url: string, signal: AbortSignal): Promise<[string, string, string]> {
  const r = await fetch(url, {
    headers: { "User-Agent": UA, "Accept-Language": "en,*;q=0.5" },
    signal: AbortSignal.any([signal, AbortSignal.timeout(30_000)]),
  });
  if (!r.ok) throw new HttpError(r.status, r.statusText);
  const [type, ...params] = (r.headers.get("content-type") || "text/plain").split(";");
  const charset = params.map(p => p.trim().match(/^charset="?([^"]+)"?$/i)?.[1]).find(Boolean) ?? "utf-8";
  const chunks: Uint8Array[] = [];
  let size = 0;
  for await (const chunk of r.body ?? []) {
    chunks.push(chunk);
    if ((size += chunk.length) >= 5_000_000) break;
  }
  const bytes = Buffer.concat(chunks).subarray(0, 5_000_000);
  let text: string;
  try {
    text = new TextDecoder(charset).decode(bytes);
  } catch {   // a charset Node doesn't know
    text = new TextDecoder("utf-8").decode(bytes);
  }
  return [r.url, type.trim().toLowerCase(), text];
}

/** The short reason a web request failed, e.g. ENOTFOUND. */
export function reason(e: unknown): string {
  const err = e as { cause?: { code?: string; message?: string }; message?: string };
  return err.cause?.code || err.cause?.message || err.message || String(e);
}

const ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", copy: "©", reg: "®", trade: "™",
  hellip: "…", mdash: "—", ndash: "–", lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”", laquo: "«", raquo: "»",
  middot: "·", bull: "•", times: "×", divide: "÷", deg: "°", plusmn: "±", micro: "µ", para: "¶", sect: "§",
  euro: "€", pound: "£", yen: "¥", cent: "¢", larr: "←", rarr: "→", uarr: "↑", darr: "↓", harr: "↔",
  // invisible ones, by code
  nbsp: String.fromCharCode(0xa0), shy: String.fromCharCode(0xad), ensp: String.fromCharCode(0x2002),
  emsp: String.fromCharCode(0x2003), thinsp: String.fromCharCode(0x2009), zwnj: String.fromCharCode(0x200c),
  zwj: String.fromCharCode(0x200d),
};

/** Text with HTML character references (&amp; &#39; &#x2014; ...) decoded. */
export function decodeEntities(s: string): string {
  return s.replace(/&(#[xX][0-9a-fA-F]+|#\d+|[a-zA-Z][a-zA-Z0-9]*);?/g, (m, e: string) => {
    if (e[0] !== "#") return ENTITIES[e] ?? m;
    const n = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
    return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : String.fromCharCode(0xfffd);   // the replacement character
  });
}
