// Getting web pages, for WebSearch and WebFetch.
// fetch uses the proxy in HTTPS_PROXY, or the Windows proxy (e.g. Clash): see proxy.ts.

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36";

/** [final url, content type, decoded text] of a web page (at most 5 MB of it). */
export async function webGet(url: string, signal: AbortSignal): Promise<[string, string, string]> {
  const r = await fetch(url, {
    headers: { "User-Agent": UA, "Accept-Language": "en,*;q=0.5" },
    signal: AbortSignal.any([signal, AbortSignal.timeout(30_000)]),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status} ${r.statusText}`);
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
