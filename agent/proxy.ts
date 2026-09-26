// The proxy for everything that goes online: Node reads neither HTTPS_PROXY on its own (without a flag) nor the
// Windows proxy setting (e.g. Clash), and curl reads only the first. So the Windows setting is copied into
// HTTPS_PROXY / HTTP_PROXY, which commands started from here inherit, and fetch is switched over to it.
// The model server stays direct (NO_PROXY).
import { execFileSync } from "node:child_process";
import * as http from "node:http";

const KEY = "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings";

/** The Windows proxy, as a URL, if one is on for every protocol. */
function windowsProxy(): string | undefined {
  try {
    const out = execFileSync("reg.exe", ["query", KEY], { encoding: "utf8", windowsHide: true, stdio: ["ignore", "pipe", "ignore"] });
    if (!/ProxyEnable\s+REG_DWORD\s+0x1\b/.test(out)) return;
    const server = out.match(/ProxyServer\s+REG_SZ\s+(\S+)/)?.[1];
    if (server && !server.includes("=")) return `http://${server}`;   // not per-protocol ones (http=...;https=...)
  } catch {}
}

export function useProxy(): void {
  const env = process.env;
  const proxy = env.HTTPS_PROXY || env.https_proxy || windowsProxy();
  if (!proxy) return;
  env.HTTPS_PROXY ??= proxy;
  env.HTTP_PROXY ??= env.http_proxy || proxy;
  env.NO_PROXY = "127.0.0.1,localhost";
  http.setGlobalProxyFromEnv();
}
