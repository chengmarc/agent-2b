// WebFetch: the readable text of a web page, in parts, after asking.
import type { Session } from "./_types.ts";
import { fill } from "../text.ts";
import { int } from "./_args.ts";
import { decodeEntities, reason, webGet } from "./_web.ts";

const PAGE_CHARS = 10000;   // characters of a page returned per call

export const SCHEMA = {
  name: "WebFetch",
  description: `Fetch a web page and return its readable text, in parts of ${PAGE_CHARS} characters.`,
  parameters: { type: "object", properties: {
    url: { type: "string" },
    offset: { type: "integer", description: "character to start from, for the next part (default 0)" },
  }, required: ["url"] },
};
export const TIP = "read the most relevant search result, or a URL the user gives.";
export const MESSAGES = {
  error: "Error: couldn't fetch {url} ({error}).",
  not_text: "Error: {url} is {type}, not a text page.",
  more: "\n\n... {rest} more characters (use offset={next})",
  end: "(End of page: it has {length} characters in total.)",
};

interface HtmlHandler {
  start(tag: string, attrs: Record<string, string | null>): void;
  end(tag: string): void;
  data(text: string): void;
}

const TAG = /<(\/?)([a-zA-Z][^\s/>]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/y;
const ATTR = /([^\s"'>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;

/** Feed an HTML page to a handler, like Python's html.parser: lower-case tag names, character references
 *  decoded, script and style contents passed on as raw text, and <x/> reported as a start and an end. */
function parseHtml(src: string, h: HtmlHandler) {
  let i = 0;
  while (i < src.length) {
    const lt = src.indexOf("<", i);
    if (lt < 0) {
      h.data(decodeEntities(src.slice(i)));
      break;
    }
    if (lt > i) h.data(decodeEntities(src.slice(i, lt)));
    if (src.startsWith("<!--", lt)) {
      const e = src.indexOf("-->", lt + 4);
      i = e < 0 ? src.length : e + 3;
      continue;
    }
    if (src[lt + 1] === "!" || src[lt + 1] === "?") {   // doctype, CDATA, processing instruction
      const e = src.indexOf(">", lt);
      i = e < 0 ? src.length : e + 1;
      continue;
    }
    TAG.lastIndex = lt;
    const m = TAG.exec(src);
    if (!m) {   // a lone "<"
      h.data("<");
      i = lt + 1;
      continue;
    }
    i = TAG.lastIndex;
    const [, close, name, rest] = m, tag = name.toLowerCase();
    if (close) {
      h.end(tag);
      continue;
    }
    const attrs: Record<string, string | null> = {};
    for (const a of rest.matchAll(ATTR)) {
      const value = a[2] ?? a[3] ?? a[4];
      attrs[a[1].toLowerCase()] = value === undefined ? null : decodeEntities(value);
    }
    h.start(tag, attrs);
    if (/\/\s*$/.test(rest)) h.end(tag);
    else if (tag === "script" || tag === "style") {
      const closing = new RegExp(`</${tag}`, "ig");
      closing.lastIndex = i;
      const e = closing.exec(src)?.index ?? src.length;
      h.data(src.slice(i, e));
      i = e;
    }
  }
}

const SKIP = new Set(["script", "style", "noscript", "svg", "head", "nav", "footer", "form", "button", "iframe", "template"]);
const SKIP_ROLES = new Set(["navigation", "banner", "contentinfo", "search", "menu", "menubar"]);
const BLOCK = new Set(["p", "div", "br", "li", "tr", "h1", "h2", "h3", "h4", "h5", "h6", "pre", "section", "article",
                       "table", "ul", "ol", "blockquote", "dt", "dd", "hr", "main", "header"]);
const VOID = new Set(["br", "hr", "img", "input", "meta", "link", "area", "base", "col", "embed", "source", "track", "wbr"]);

/** Readable text of an HTML page, roughly as a browser shows it, minus scripts, styles and page chrome. */
class PageText implements HtmlHandler {
  parts: string[] = [];
  skip = 0;
  pre = 0;
  title = "";
  inTitle = false;
  roleTag: string | null = null;   // an element skipped for its role, e.g. <div role="navigation">
  roleDepth = 0;

  start(tag: string, a: Record<string, string | null>) {
    if (this.roleTag) {
      if (tag === this.roleTag) this.roleDepth++;
      return;
    }
    if (!VOID.has(tag) && (SKIP_ROLES.has(a.role ?? "") || a["aria-hidden"] === "true")) {
      this.roleTag = tag;
      this.roleDepth = 1;
      return;
    }
    if (tag === "title") this.inTitle = true;
    if (SKIP.has(tag)) this.skip++;
    else if (BLOCK.has(tag)) this.parts.push("\n");
    if (tag === "pre") this.pre++;
    if (!this.skip && (tag === "h1" || tag === "h2" || tag === "h3")) this.parts.push("#".repeat(Number(tag[1])) + " ");
    if (!this.skip && tag === "li") this.parts.push("- ");
  }

  end(tag: string) {
    if (this.roleTag) {
      if (tag === this.roleTag && !--this.roleDepth) this.roleTag = null;
      return;
    }
    if (tag === "title") this.inTitle = false;
    if (SKIP.has(tag) && this.skip) this.skip--;
    else if (BLOCK.has(tag)) this.parts.push("\n");
    if (tag === "pre" && this.pre) this.pre--;
  }

  data(text: string) {
    if (this.inTitle) this.title += text;
    // Browsers collapse whitespace outside <pre>; inside it, mark each line (\0) to keep its indentation.
    else if (!this.skip && !this.roleTag) this.parts.push(this.pre ? text.replaceAll("\n", "\n\0") : text.replace(/\s+/g, " "));
  }

  text(): string {
    const out: string[] = [];
    for (const l of this.parts.join("").split("\n")) {
      if (l.startsWith("\0")) out.push(l.slice(1).trimEnd());
      else if (!/^[-|»·•¶#\s]+$/.test(l)) out.push(l.trim());   // drop leftovers of menus and heading anchors
    }
    return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  }
}

export async function run(ag: Session, args: { url: string; offset?: number }): Promise<string> {
  let url = args.url;
  if (!/^https?:\/\//.test(url)) url = "https://" + url;
  const denied = await ag.confirm(`fetch ${url}`);
  if (denied) return denied;
  let final: string, ctype: string, body: string;
  try {
    [final, ctype, body] = await webGet(url, ag.signal);
  } catch (e) {
    if (ag.signal.aborted) throw e;
    return fill(MESSAGES.error, { url, error: reason(e) });
  }
  let head: string, text: string;
  if (ctype.includes("html")) {
    const p = new PageText();
    parseHtml(body, p);
    [head, text] = [`Title: ${p.title.trim()}\nURL: ${final}\n\n`, p.text()];
  } else if (ctype.startsWith("text/") || ["json", "xml", "javascript"].some(t => ctype.includes(t))) {
    [head, text] = [`URL: ${final}\n\n`, body];
  } else {
    return fill(MESSAGES.not_text, { url, type: ctype });
  }
  const offset = Math.max(0, int(args.offset, 0));
  if (offset >= text.length) return head + fill(MESSAGES.end, { length: text.length });
  const part = text.slice(offset, offset + PAGE_CHARS), rest = text.length - offset - PAGE_CHARS;
  return head + part + (rest > 0 ? fill(MESSAGES.more, { rest, next: offset + PAGE_CHARS }) : "");
}
