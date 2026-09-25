// Markdown in the model's answers, rendered as it streams: headings, lists, quotes, rules, code blocks and
// tables, and **bold**, *italic* and `code` within a line. It holds back only what it can't decide yet: the start
// of a line (is "-" a bullet or a rule?), a * that may be half of a **, and table rows (drawn once the table ends).
import { BOLD, DIM, GOLD, ITALIC, ROSE, RST, VIOLET, width } from "./theme.ts";

/** The styles within one line: **bold**, *italic*, `code`. */
class Inline {
  base: string;   // the line's own style (a heading's, a quote's), restored after each span
  bold = false;
  italic = false;
  code = false;
  held = "";      // *s not yet known to be * or **
  prev = " ";     // the character before them

  constructor(base = "") {
    this.base = base;
  }

  style(): string {
    return RST + this.base + (this.bold ? BOLD : "") + (this.italic ? ITALIC : "") + (this.code ? VIOLET : "");
  }

  feed(text: string): string {
    let out = "";
    for (const c of text) {
      if (this.code) {
        if (c === "`") this.code = false;
        out += c === "`" ? this.style() : c;
      } else if (c === "*") {
        this.held += c;
        continue;
      } else {
        out += this.release(c);
        if (c === "`") this.code = true;
        out += c === "`" ? this.style() : c;
      }
      this.prev = c;
    }
    return out;
  }

  /** The held *s, now that the character after them is known ("" at the end of the line). ** and * open a
   *  bold or an italic at the start of a word and close one at the end of a word; anywhere else they're just
   *  *s (a * b, 2*3). */
  release(next: string): string {
    if (!this.held) return "";
    const run = this.held;
    this.held = "";
    const opens = /\S/.test(next) && !/[\p{L}\p{N}]/u.test(this.prev), closes = /\S/.test(this.prev);
    const bold = run.length >= 2 && (this.bold ? closes : opens);
    const italic = run.length % 2 === 1 && (this.italic ? closes : opens);
    if (!bold && !italic) return run;
    if (bold) this.bold = !this.bold;
    if (italic) this.italic = !this.italic;
    return this.style() + "*".repeat(run.length - (bold ? 2 : 0) - (italic ? 1 : 0));
  }

  /** A whole piece of text in this style (a table cell). */
  render(text: string): string {
    return this.style() + this.feed(text) + this.end();
  }

  /** The end of the line: no style carries over to the next one. */
  end(): string {
    const out = this.release("");
    this.bold = this.italic = this.code = false;
    this.prev = " ";
    return out + RST;
  }
}

export class Markdown {
  head = "";      // the current line so far, until its kind is known (and all of it for "whole" lines)
  mode: "head" | "text" | "code" | "whole" = "head";
  whole: "fence" | "table" = "table";   // which kind of line is being taken whole
  inline = new Inline();
  fence = false;  // inside a ``` code block
  table: string[] = [];   // rows of the table being read

  feed(text: string): string {
    let out = "";
    for (const c of text) {
      if (c === "\n") out += this.endLine();
      else if (this.mode === "text") out += this.inline.feed(c);
      else if (this.mode === "code") out += c === "\t" ? "    " : c;
      else {
        this.head += c;
        if (this.mode === "head") out += this.start(false);
      }
    }
    return out;
  }

  /** The end of the answer: its last line, which has no newline. */
  flush(): string {
    let out = this.head || this.mode !== "head" ? this.endLine().replace(/\n$/, "") : "";
    if (this.table.length) out += this.drawTable().join("\n");
    this.fence = false;
    return out;
  }

  endLine(): string {
    let out = this.mode === "head" ? this.start(true) : "";
    if (this.mode === "text") out += this.inline.end() + "\n";
    else if (this.mode === "code") out += RST + "\n";
    else if (this.whole === "fence") this.fence = !this.fence;   // the ``` lines themselves show nothing
    else this.table.push(this.head);
    this.head = "";
    this.mode = "head";
    return out;
  }

  /** Decide what kind of line this is, from its start (all of it when `final`); "" while it can't tell yet.
   *  Returns the line's prefix and its text so far, and sets the mode for the rest of it. */
  start(final: boolean): string {
    const line = this.head, indent = line.match(/^ */)![0], t = line.slice(indent.length);
    const wait = !final && (t === "" || t === ">" || /^`{1,2}$/.test(t) ||
                            (!this.fence && (/^#{1,6}$/.test(t) || /^[-*_+][-*_+ ]*$/.test(t) || /^\d+[.)]?$/.test(t))));
    if (wait) return "";
    if (t.startsWith("```") || (!this.fence && t.startsWith("|"))) {
      this.mode = "whole";
      this.whole = t.startsWith("|") ? "table" : "fence";
      return this.whole === "fence" ? this.tableDone() : "";
    }
    let out = this.tableDone();
    if (this.fence) {
      this.mode = "code";
      return out + `${DIM}│${RST} ${VIOLET}` + line.replaceAll("\t", "    ");
    }
    this.mode = "text";
    let rest = t, m: RegExpMatchArray | null;
    this.inline = new Inline();
    if (/^([-*_])( *\1){2,} *$/.test(t)) {
      const cols = Math.min(process.stdout.columns || 80, 100) - 4;
      return out + `${DIM}${"─".repeat(cols)}${RST}`;
    } else if ((m = t.match(/^(#{1,6}) /))) {
      this.inline = new Inline(BOLD + GOLD);
      rest = t.slice(m[0].length);
    } else if ((m = t.match(/^[-*+] /))) {
      out += `${indent}${ROSE}•${RST} `;
      rest = t.slice(2);
    } else if ((m = t.match(/^\d+[.)] /))) {
      out += `${indent}${ROSE}${m[0].trimEnd()}${RST} `;
      rest = t.slice(m[0].length);
    } else if (t.startsWith(">")) {
      out += `${indent}${DIM}│${RST} `;
      this.inline = new Inline(DIM);
      rest = t.replace(/^> ?/, "");
    } else {
      out += indent;
    }
    return out + this.inline.style() + this.inline.feed(rest);
  }

  /** The table read so far, drawn (with a newline after each row) now that a line of another kind has begun. */
  tableDone(): string {
    return this.table.length ? this.drawTable().map(l => l + "\n").join("") : "";
  }

  /** The table's rows lined up in columns, the header in bold; as plain lines if it's wider than the terminal. */
  drawTable(): string[] {
    const rows = this.table.map(r => r.trim().replace(/^\|/, "").replace(/(?<!\\)\|$/, "")
                                      .split(/(?<!\\)\|/).map(c => c.trim().replaceAll("\\|", "|")));
    this.table = [];
    const sep = rows.findIndex(r => r.every(c => /^:?-+:?$/.test(c)));
    const right = sep < 0 ? [] : rows[sep].map(c => /[^:]:$/.test(c));
    const body = rows.filter((_, i) => i !== sep);
    const cells = body.map((r, i) => r.map(c => new Inline(i === 0 && sep === 1 ? BOLD : "").render(c)));
    const n = Math.max(...cells.map(r => r.length));
    const w = Array.from({ length: n }, (_, j) => Math.max(...cells.map(r => width(r[j] ?? ""))));
    if (w.reduce((a, b) => a + b, 0) + 3 * (n - 1) + 2 > (process.stdout.columns || 80))
      return body.map(r => new Inline().render(r.join(" | ")));
    const lines = cells.map(r => w.map((cw, j) => {
      const c = r[j] ?? "", pad = " ".repeat(cw - width(c));
      return right[j] ? pad + c : c + (j < n - 1 ? pad : "");
    }).join(`${DIM} │ ${RST}`));
    if (sep === 1) lines.splice(1, 0, DIM + w.map(cw => "─".repeat(cw)).join("─┼─") + RST);
    return lines;
  }
}
