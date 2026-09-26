// The terminal's input: questions to the user, pastes, lines typed ahead, and Ctrl+C.
// One readline for the session: lines typed ahead wait in `ahead` for the next question.
// A paste of several lines is one answer: it shows in the line as [pasted #N: K lines] (see pasteFilter).
// Between questions the terminal is in its normal mode, so Ctrl+C is a signal (which also stops a running command).
// Ctrl+C at the prompt quits; during a request it drops the request, including a question it is waiting on.
import * as readline from "node:readline";

const write = (s: string) => process.stdout.write(s);
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
