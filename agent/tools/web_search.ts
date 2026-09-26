// WebSearch: DuckDuckGo results (title, URL, snippet).
import type { Session } from "./_types.ts";
import { fill } from "../text.ts";
import { decodeEntities, reason, webGet } from "./_web.ts";

export const SCHEMA = {
  name: "WebSearch",
  description: "Search the web. Returns titles, URLs and snippets; read a result with WebFetch.",
  parameters: { type: "object", properties: {
    query: { type: "string" },
  }, required: ["query"] },
};
export const TIP = "look up documentation, error messages, or anything newer than your knowledge. " +
  "Search first, then fetch the most relevant result with WebFetch.";
export const MESSAGES = {
  error: "Error: the search failed ({error}).",
  none: "No results for {query}.",
};

const RESULT = /class="result__a" href="([^"]+)"[^>]*>(.*?)<\/a>(.*?)(?=class="result__a"|$)/gs;

/** [[title, url, snippet]] from DuckDuckGo's plain-HTML results page. */
async function duckduckgo(query: string, signal: AbortSignal, n = 8): Promise<[string, string, string][]> {
  const [, , page] = await webGet("https://html.duckduckgo.com/html/?q=" + encodeURIComponent(query).replaceAll("%20", "+"), signal);
  const clean = (s: string) => decodeEntities(s.replace(/<[^>]+>/g, "")).trim();
  const out: [string, string, string][] = [];
  for (const [, link, title, rest] of page.matchAll(RESULT)) {
    let href = link;
    const target = href.match(/uddg=([^&]+)/);   // DuckDuckGo wraps results in a redirect link
    if (target) {
      try { href = decodeURIComponent(target[1]); } catch { href = target[1]; }
    }
    if (href.includes("duckduckgo.com/y.js")) continue;   // ads
    const snip = rest.match(/class="result__snippet"[^>]*>(.*?)<\/a>/s);
    out.push([clean(title), href, snip ? clean(snip[1]) : ""]);
    if (out.length >= n) break;
  }
  return out;
}

export async function run(ag: Session, args: { query: string }): Promise<string> {
  let results: [string, string, string][];
  try {
    results = await duckduckgo(args.query, ag.signal);
  } catch (e) {
    if (ag.signal.aborted) throw e;
    return fill(MESSAGES.error, { error: reason(e) });
  }
  if (!results.length) return fill(MESSAGES.none, { query: args.query });
  return results.map(([t, u, s], i) => `${i + 1}. ${t}\n   ${u}\n   ${s}`).join("\n\n");
}
