// The terminal's output: the layout of a session's blocks, the waiting spinner, file diffs, the banner.
// Input (questions to the user, pastes, Ctrl+C) is in input.ts, colors in theme.ts.
import { LOGO } from "./logo.ts";
import { Markdown } from "./markdown.ts";
import { BOLD, DIM, GOLD, GRN, RED, ROSE, RST, shade, VIOLET } from "./theme.ts";

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
  return `\n${logo}\n\n${BOLD}${GOLD}Agent 2B${RST} · ${ROSE}Local Agent${RST} · ${VIOLET}${root}${RST}`;
}
