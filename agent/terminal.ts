// The terminal: output (the layout of a session's blocks, the waiting spinner, file diffs, the banner)
// and input (questions to the user, pastes, lines typed ahead, Ctrl+C). Colors are in theme.ts.
import * as readline from "node:readline";
import { LOGO } from "./logo.ts";
import { Markdown } from "./markdown.ts";
import { BOLD, DIM, GOLD, GRN, RED, ROSE, RST, shade, VIOLET } from "./theme.ts";

export * from "./theme.ts";
export const SPINNER = "⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏";

const write = (s: string) => process.stdout.write(s);

/** Terminal layout: each block (thinking, answer, tool call, notice) starts on a fresh line with a
 *  blank line before it, except consecutive tool calls; text after a block's first line is indented.
 *  The answer's markdown is rendered as it streams (markdown.ts). */
class Screen {
  kind: "think" | "say" | "tool" | "note" | null = null;
  fresh = false;
  md = new Markdown();
  spinner: ReturnType<typeof setInterval> | null = null;

  block(kind: "think" | "say" | "tool" | "note", head: string) {
    this.stopWaiting();
    this.close();
    if (!(kind === "tool" && this.kind === "tool")) write("\n");
    write(head);
    this.kind = kind;
    this.fresh = true;
  }

  /** Streamed thinking or answer text. */
  stream(kind: "think" | "say", text: string) {
    if (this.kind !== kind) {
      this.block(kind, kind === "think" ? `  ${DIM}thinking: ` : `${ROSE}●${RST} `);
      if (kind === "say") this.md = new Markdown();
    }
    if (this.fresh) {
      text = text.trimStart();
      this.fresh = !text;
    }
    if (kind === "say") text = this.md.feed(text);
    write(text.replaceAll("\n", "\n  "));
  }

  /** Finish an open streamed block: the rest of the answer's markdown, then end its line. */
  close() {
    if (this.kind === "say") write(this.md.flush().replaceAll("\n", "\n  "));
    if (this.kind === "think" || this.kind === "say") write(RST + "\n");
  }

  /** Waiting for the model: a spinner with the seconds so far, on the line the next block will use
   *  (below the blank line that comes before a block); the next output takes its place. */
  wait() {
    if (this.spinner || !process.stdout.isTTY || this.kind === "think" || this.kind === "say") return;
    const start = Date.now();
    let i = 0;
    const draw = () => write(`\r${ROSE}${SPINNER[i++ % SPINNER.length]}${RST} ` +
                             `${DIM}working ${Math.floor((Date.now() - start) / 1000)}s · Ctrl+C to stop${RST}\x1b[K`);
    write("\n");
    draw();
    this.spinner = setInterval(draw, 80);
  }

  stopWaiting() {
    if (!this.spinner) return;
    clearInterval(this.spinner);
    this.spinner = null;
    write("\r\x1b[2K\x1b[A");   // back to the start of the line above, where the spinner's "\n" began
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
    this.stopWaiting();
    this.close();
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

export function banner(root: string): string {
  const w = Math.max(...LOGO.map(l => l.length)) - 1;
  const logo = LOGO.map(l => BOLD + [...l].map((ch, i) => shade(i / w) + ch).join("") + RST).join("\n");
  return `\n${logo}\n\n${BOLD}${GOLD}Salieri${RST} · ${ROSE}Local Agent${RST} · ${VIOLET}${root}${RST}`;
}

// ---------- input and Ctrl+C ----------
// One readline for the session: lines typed ahead wait in `ahead` for the next question.
// A paste of several lines is one answer: it shows in the line as [pasted #N: K lines] (see pasteFilter).
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

/** Hand the question being waited on its answer; lines typed ahead can arrive together, so clear it at once. */
function answer(line: string | null) {
  const w = waiting;
  waiting = null;
  w?.resolve(line);
}

// ---- pastes ----
type Key = { name?: string };
type OnKey = (s: string | undefined, key?: Key) => void;
const pastes: string[] = [];   // pastes[N - 1] is the text of [pasted #N: K lines]
const PASTED = /\[pasted #(\d+): \d+ lines\]/g;

/** Keys on their way to readline, except pastes. A paste comes between bracketed-paste markers when the
 *  terminal sends them (ask turns them on); otherwise it's any text with a line break inside it that arrives in
 *  one read, which typing never does. One line goes into the line as text, several as a placeholder. */
function pasteFilter(forward: OnKey): OnKey {
  let queue: [string | undefined, Key | undefined][] = [], bracketed: string | null = null;
  const paste = (raw: string) => {
    const text = raw.replace(/\r\n?/g, "\n").replaceAll("\t", "    ").replace(/[\x00-\x09\x0b-\x1f\x7f]/g, "")
                    .replace(/^\n+|\n+$/g, "");
    if (!text.includes("\n")) {
      if (text) forward(text);
      return;
    }
    pastes.push(text);
    forward(`[pasted #${pastes.length}: ${text.split("\n").length} lines]`);
  };
  const flush = () => {
    const keys = queue;
    queue = [];
    const text = keys.map(([s]) => s ?? "").join("");
    if (/[\r\n]/.test(text.replace(/[\r\n]+$/, ""))) paste(text);
    else keys.forEach(([s, key]) => forward(s, key));
  };
  return (s, key) => {
    if (key?.name === "paste-start") {
      flush();
      bracketed = "";
    } else if (key?.name === "paste-end") {
      if (bracketed !== null) paste(bracketed);
      bracketed = null;
    } else if (bracketed !== null) {
      bracketed += s ?? "";
    } else {
      // The keys of one read arrive together: look at them all once they have.
      if (queue.push([s, key]) === 1) queueMicrotask(flush);
    }
  };
}

function input(): readline.Interface {
  if (!rl) {
    const others = process.stdin.listeners("keypress");
    rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const keys = process.stdin.listeners("keypress").find(f => !others.includes(f)) as OnKey | undefined;
    if (keys) {   // a terminal: readline reads keys, and pastes go through pasteFilter first
      process.stdin.removeListener("keypress", keys);
      process.stdin.on("keypress", pasteFilter(keys));
    }
    rl.on("line", line => {
      line = line.replace(PASTED, (m, n: string) => pastes[Number(n) - 1] ?? m);
      if (waiting) answer(line);
      else ahead.push(line);
    });
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
    if (process.stdout.isTTY) write("\x1b[?2004h");   // bracketed paste on while a question is open
    rl.setPrompt(prompt);
    rl.prompt();
  }).finally(() => {
    waiting = null;
    if (process.stdout.isTTY) write("\x1b[?2004l");
    if (inputClosed) return;
    rl.pause();
    setRaw(false);
  });
}
