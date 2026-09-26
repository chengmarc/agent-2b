// The loading screen, from typing `2b` until the model server takes requests: the agent starts llama-server
// in the background (server.ts) and shows up right away. llama-server doesn't report its progress, so the
// bar is an estimate from how long the last load took, and the stage below it comes from the server's log.
import * as fs from "node:fs";
import { LOAD_SECONDS, LOG, MODEL } from "../paths.ts";
import { CTX, running, serverReady } from "./server.ts";
import { SPINNER } from "../terminal/screen.ts";
import { DIM, RED, ROSE, RST, shade } from "../terminal/theme.ts";
import { fill, splitLines } from "../text.ts";

const TIMEOUT = 300;   // seconds
const BAR = 28;        // cells, each a full-height block
const TRACK = "\x1b[38;2;228;220;208m";   // the bar's empty part: a shade darker than the background
// The last of these the log has reached is the stage shown.
const STAGES: [RegExp, string][] = [
  [/load_model: loading model/, "reading {size} of weights"],
  [/threadpool init|load_model: initializing/, "setting up the {ctx}-token context"],
  [/model loaded|listening on/, "almost ready"],
];

const write = (s: string) => process.stdout.write(s);
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/** The server log, if this launch has written it (an older one may still be there). */
function freshLog(since: number): string {
  try {
    if (fs.statSync(LOG).mtimeMs < since - 2000) return "";
    return fs.readFileSync(LOG, "utf8").replace(/\x1b\[[0-9;]*m/g, "");
  } catch {
    return "";
  }
}

function bar(progress: number | null, frame: number): string {
  if (progress === null) {   // no estimate yet: a segment sweeping back and forth
    const span = BAR - 7, at = Math.abs((frame % (2 * span)) - span);
    return [...Array(BAR)].map((_, i) => (i >= at && i < at + 7 ? shade(i / (BAR - 1)) : TRACK) + "█" + RST).join("");
  }
  const full = Math.round(progress * BAR);
  return [...Array(BAR)].map((_, i) => (i < full ? shade(i / (BAR - 1)) : TRACK) + "█" + RST).join("");
}

/** Wait for the model server, drawing the loading screen where the cursor is. The seconds it took to load
 *  (0 if it was running already), or null, after showing why, if it didn't come up. */
export async function waitForServer(): Promise<number | null> {
  if (await serverReady()) return 0;
  const start = Date.now(), tty = process.stdout.isTTY;
  let last = 0;
  try {
    last = Number(fs.readFileSync(LOAD_SECONDS, "utf8")) || 0;
  } catch {}
  let size = "the";
  try {
    size = `${(fs.statSync(MODEL).size / 1e9).toFixed(1)} GB`;
  } catch {}
  let stage = "starting llama-server", ready = false, alive: boolean | null = null, seen = false;
  let drawing = tty;
  if (tty) {
    write("\x1b[?25l");   // no cursor blinking over the bar; quitting (Ctrl+C) leaves the prompt below it
    process.once("exit", () => write((drawing ? "\n\n" : "") + "\x1b[?25h"));
  } else {
    write("Loading the model...\n");
  }
  /** Erase the screen's two lines, leaving the cursor where they began. */
  const done = () => {
    if (tty) write("\r\x1b[K\n\x1b[K\x1b[A\r\x1b[?25h");
    drawing = false;
  };

  for (let tick = 0; ; tick++) {
    const secs = (Date.now() - start) / 1000;
    if (tick % 5 === 0) serverReady().then(ok => { ready ||= ok; });
    if (tick % 20 === 0) running().then(on => { alive = on; seen ||= on; });
    if (tick % 10 === 0) {
      const log = freshLog(start);
      for (const [re, text] of STAGES) if (re.test(log)) stage = fill(text, { size, ctx: CTX.toLocaleString("en") });
    }
    if (ready) {
      done();
      if (secs > 1) fs.writeFileSync(LOAD_SECONDS, secs.toFixed(0));
      return secs;
    }
    const gone = seen ? alive === false : secs > 20;   // the launch takes a few seconds to show up
    if (gone || secs > TIMEOUT) {
      done();
      const why = gone ? (seen ? "stopped before it was ready" : "didn't start") : `isn't ready after ${TIMEOUT} s`;
      const tail = splitLines(freshLog(start)).slice(-12);
      console.log(`${RED}✗${RST} The model server ${why}.`);
      if (tail.length) console.log(tail.map(l => `  ${DIM}${l}${RST}`).join("\n"));
      console.log(`  Out of memory? Close other programs that use the GPU or a lot of RAM, and start 2b again.\n` +
                  `  A corrupted download? Delete runtime/llama/ or runtime/model/ and double-click install.\n` +
                  `  ${DIM}The whole log: logs/server.log${RST}`);
      return null;
    }
    if (tty) {
      const progress = last ? Math.min(secs / last, 0.95) : null;
      const time = last ? `${secs.toFixed(0)}s / ~${last.toFixed(0)}s` : `${secs.toFixed(0)}s`;
      const hint = last ? "" : " · the first load can take a minute";
      write(`\r\x1b[K${ROSE}${SPINNER[tick % SPINNER.length]}${RST} Loading model  ${bar(progress, tick)}  ` +
            `${progress === null ? "" : `${Math.floor(progress * 100)}%  `}${DIM}${time}${RST}` +
            `\n\x1b[K  ${DIM}${stage}${hint}${RST}\x1b[A\r`);
    }
    await sleep(100);
  }
}
