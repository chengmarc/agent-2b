// The terminal's output: the layout of a session's blocks, the waiting spinner, file diffs.
// Input (questions to the user, pastes, Ctrl+C) is in input.ts, colors in theme.ts.
import { unifiedDiff } from "./diff.ts";
import { Markdown } from "./markdown.ts";
import { BOLD, DIM, GRN, RED, ROSE, RST, VIOLET } from "./theme.ts";

export const SPINNER = "⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏";

const write = (s: string) => process.stdout.write(s);

/** Terminal layout: each block (thinking, answer, tool call, notice) starts on a fresh line with a
 *  blank line before it; text after a block's first line is indented.
 *  The answer's markdown is rendered as it streams (markdown.ts). */
class Screen {
  kind: "think" | "say" | "tool" | "note" | null = null;
  fresh = false;
  md = new Markdown();
  spinner: ReturnType<typeof setInterval> | null = null;

  block(kind: "think" | "say" | "tool" | "note", head: string) {
    this.stopWaiting();
    this.close();
    write("\n");
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
