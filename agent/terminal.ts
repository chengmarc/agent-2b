// The terminal: output (colors, the layout of a session's blocks, file diffs, the banner)
// and input (questions to the user, lines pasted ahead, Ctrl+C).
import * as readline from "node:readline";

export const DIM = "\x1b[2m", BOLD = "\x1b[1m", YEL = "\x1b[33m", RED = "\x1b[31m", GRN = "\x1b[32m", RST = "\x1b[0m";
const GRADIENT = [[246, 193, 119], [235, 111, 146], [196, 167, 231]];   // gold -> rose -> violet

/** Color at position t (0..1) along GRADIENT, as a 24-bit ANSI foreground code. */
export function shade(t: number): string {
  const seg = Math.min(Math.trunc(t * (GRADIENT.length - 1)), GRADIENT.length - 2);
  const u = t * (GRADIENT.length - 1) - seg;
  const [r, g, b] = GRADIENT[seg].map((a, i) => Math.round(a + (GRADIENT[seg + 1][i] - a) * u));
  return `\x1b[38;2;${r};${g};${b}m`;
}

export const GOLD = shade(0), ROSE = shade(0.5), VIOLET = shade(1);

const write = (s: string) => process.stdout.write(s);

/** Terminal layout: each block (thinking, answer, tool call, notice) starts on a fresh line with a
 *  blank line before it, except consecutive tool calls; text after a block's first line is indented. */
class Screen {
  kind: "think" | "say" | "tool" | "note" | null = null;
  fresh = false;

  block(kind: "think" | "say" | "tool" | "note", head: string) {
    if (this.kind === "think" || this.kind === "say") write(RST + "\n");
    if (!(kind === "tool" && this.kind === "tool")) write("\n");
    write(head);
    this.kind = kind;
    this.fresh = true;
  }

  /** Streamed thinking or answer text. */
  stream(kind: "think" | "say", text: string) {
    if (this.kind !== kind) this.block(kind, kind === "think" ? `  ${DIM}thinking: ` : `${ROSE}●${RST} `);
    if (this.fresh) {
      text = text.trimStart();
      this.fresh = !text;
    }
    write(text.replaceAll("\n", "\n  "));
  }

  tool(name: string, arg: string) {
    this.block("tool", `${VIOLET}●${RST} ${VIOLET}${BOLD}${name}${RST} ${arg}\n`);
  }

  /** Tool output under the tool line: [[color, text], ...]. */
  detail(lines: [string, string][]) {
    lines.forEach(([color, text], i) => write((i === 0 ? "  ⎿ " : "    ") + `${color}${text}${RST}\n`));
  }

  /** A file change under the tool line, as a unified diff (first 80 lines). */
  diff(old: string[], updated: string[]) {
    const diff = unifiedDiff(old, updated);
    const lines: [string, string][] = diff.slice(0, 80).map(l => [l[0] === "+" ? GRN : l[0] === "-" ? RED : DIM, l]);
    if (diff.length > 80) lines.push([DIM, `... (${diff.length - 80} more diff lines)`]);
    this.detail(lines);
  }

  note(text: string, color = DIM) {
    this.block("note", `  ${color}${text}${RST}\n`);
  }

  /** Close an open streamed block before input is read. */
  end() {
    if (this.kind === "think" || this.kind === "say") write(RST + "\n");
    this.kind = null;
  }
}

export const SCREEN = new Screen();

/** Hunks of a unified diff ("@@" headers and " ", "-", "+" lines, no file headers), with 2 lines of context. */
function unifiedDiff(a: string[], b: string[], context = 2): string[] {
  // Edit script: the common start and end, and a longest common subsequence of the middle.
  let pre = 0, suf = 0;
  while (pre < a.length && pre < b.length && a[pre] === b[pre]) pre++;
  while (suf < a.length - pre && suf < b.length - pre && a[a.length - 1 - suf] === b[b.length - 1 - suf]) suf++;
  const am = a.slice(pre, a.length - suf), bm = b.slice(pre, b.length - suf);
  const pairs: [number, number][] = [];   // matching lines (i, j) of the middle
  if (am.length * bm.length <= 4_000_000) {   // otherwise: show the whole middle as replaced
    const w = bm.length + 1, L = new Uint32Array((am.length + 1) * w);
    for (let i = am.length - 1; i >= 0; i--)
      for (let j = bm.length - 1; j >= 0; j--)
        L[i * w + j] = am[i] === bm[j] ? L[(i + 1) * w + j + 1] + 1 : Math.max(L[(i + 1) * w + j], L[i * w + j + 1]);
    for (let i = 0, j = 0; i < am.length && j < bm.length;) {
      if (am[i] === bm[j]) pairs.push([i++, j++]);
      else if (L[(i + 1) * w + j] >= L[i * w + j + 1]) i++;
      else j++;
    }
  }
  const rows: [" " | "-" | "+", string, number, number][] = [];   // [tag, line, line in a, line in b]
  let i = 0, j = 0;
  const same = (n: number) => { for (let k = 0; k < n; k++, i++, j++) rows.push([" ", a[i], i, j]); };
  const change = (i2: number, j2: number) => {
    for (; i < i2; i++) rows.push(["-", a[i], i, j]);
    for (; j < j2; j++) rows.push(["+", b[j], i, j]);
  };
  same(pre);
  for (const [pi, pj] of pairs) {
    change(pre + pi, pre + pj);
    same(1);
  }
  change(a.length - suf, b.length - suf);
  same(suf);

  const range = (start: number, n: number) => n === 1 ? `${start + 1}` : n === 0 ? `${start},0` : `${start + 1},${n}`;
  const changed = rows.flatMap((r, k) => (r[0] === " " ? [] : [k]));
  const out: string[] = [];
  for (let k = 0; k < changed.length;) {
    let last = k;
    while (last + 1 < changed.length && changed[last + 1] - changed[last] <= 2 * context + 1) last++;
    const hunk = rows.slice(Math.max(0, changed[k] - context), changed[last] + context + 1);
    const oldLen = hunk.filter(r => r[0] !== "+").length, newLen = hunk.filter(r => r[0] !== "-").length;
    out.push(`@@ -${range(hunk[0][2], oldLen)} +${range(hunk[0][3], newLen)} @@`, ...hunk.map(r => r[0] + r[1]));
    k = last + 1;
  }
  return out;
}

const LOGO = ["╭─╮╭─╮╷  ╷╭─╴╭─╮╷",
              "╰─╮├─┤│  │├╴ ├┬╯│",
              "╰─╯╵ ╵╰─╴╵╰─╴╵╰╴╵"];

export function banner(root: string): string {
  const w = Math.max(...LOGO.map(l => l.length)) - 1;
  const logo = LOGO.map(l => BOLD + [...l].map((ch, i) => shade(i / w) + ch).join("") + RST).join("\n");
  return `\n${logo}\n\n${BOLD}${GOLD}Salieri${RST} · ${ROSE}Local Agent${RST} · ${VIOLET}${root}${RST}`;
}

// ---------- input and Ctrl+C ----------
// One readline for the session: lines typed or pasted ahead wait in `ahead` for the next question.
// Between questions the terminal is in its normal mode, so Ctrl+C is a signal (which also stops a running command).
// Ctrl+C at the prompt quits; during a request it drops the request, including a question it is waiting on.
const interrupted = () => new DOMException("interrupted", "AbortError");
export const isAbort = (e: unknown) => (e as Error | null)?.name === "AbortError";
let request: AbortController | null = null;
let waiting: { resolve(line: string | null): void; reject(e: Error): void } | null = null;
const ahead: string[] = [];
let inputClosed = false;
let rl: readline.Interface | null = null;

function interrupt() {
  if (waiting) waiting.reject(interrupted());
  else if (request) request.abort(interrupted());
  else process.exit(130);
}
process.on("SIGINT", interrupt);

/** Ctrl+C now aborts this request (until endRequest) instead of quitting. */
export function beginRequest(): AbortSignal {
  request = new AbortController();
  return request.signal;
}

export function endRequest() {
  request = null;
}

const setRaw = (on: boolean) => { if (process.stdin.isTTY) process.stdin.setRawMode(on); };

/** Hand the question being waited on its answer; a pasted block's lines arrive together, so clear it at once. */
function answer(line: string | null) {
  const w = waiting;
  waiting = null;
  w?.resolve(line);
}

function input(): readline.Interface {
  if (!rl) {
    rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.on("line", line => (waiting ? answer(line) : ahead.push(line)));
    rl.on("close", () => { inputClosed = true; answer(null); });
    rl.on("SIGINT", () => { write("\n"); interrupt(); });   // Ctrl+C while a question is open
  }
  return rl;
}

/** One line from the user; null at end of input. */
export function ask(prompt: string): Promise<string | null> {
  const rl = input();
  if (ahead.length) {
    write(prompt + ahead[0] + "\n");
    return Promise.resolve(ahead.shift()!);
  }
  if (inputClosed) return Promise.resolve(null);
  return new Promise<string | null>((resolve, reject) => {
    waiting = { resolve, reject };
    setRaw(true);
    rl.setPrompt(prompt);
    rl.prompt();
  }).finally(() => {
    waiting = null;
    if (inputClosed) return;
    rl.pause();
    setRaw(false);
  });
}
