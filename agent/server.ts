// The model server, llama-server (llama.cpp, the process that runs the model): its settings (configs/llama.conf),
// starting it for the agent, talking to it over HTTP, and stopping it once the last 2B window is done.
// Run as a script (node server.ts PID), this file is that stopper: see watchServer.
import { execFile, spawn } from "node:child_process";
import * as fs from "node:fs";
import * as http from "node:http";
import * as path from "node:path";
import { AGENTS, CONF, LLAMA, LOG, MODEL, ROOT } from "./paths.ts";

const PORT = 8080;
export const SERVER = `http://127.0.0.1:${PORT}`;
const PROCESS = path.basename(LLAMA);   // its name in the task list
const LOCAL = new http.Agent();   // talks to llama-server directly, never through HTTPS_PROXY

/** configs/llama.conf: KEY=value lines and # comments. Empty if it's missing. */
function readConf(): Record<string, string> {
  const out: Record<string, string> = {};
  let text = "";
  try {
    text = fs.readFileSync(CONF, "utf8");
  } catch {}
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*(\w+)\s*=\s*(.*?)\s*$/);
    if (m) out[m[1]] = m[2];
  }
  return out;
}
const config = readConf();
export const CTX = Number(config.CTX);    // server context window
export const NCPUMOE = config.NCPUMOE;    // expert layers on the CPU

/** Start the server in the background, or say why it can't be. It only launches it: the agent is on screen
 *  at once, and its loading screen waits for the model (loading.ts). */
export function startServer(): string | null {
  if (!fs.existsSync(LLAMA)) return "llama.cpp is missing. Double-click install";
  if (!fs.existsSync(MODEL)) return "the model is missing. Double-click install";
  if (!NCPUMOE || !config.LOADMODE || !CTX) return "configs/llama.conf needs NCPUMOE, LOADMODE and CTX";
  fs.mkdirSync(path.dirname(LOG), { recursive: true });
  // A hidden process of its own (no window), not tied to this one; if it fails, the loading screen says so.
  // --jinja: format every message with the chat template inside the model file.
  spawn(LLAMA, ["-m", MODEL, "--log-file", LOG, "--alias", "gpt-oss-20b", "-c", String(CTX), "--parallel", "1",
                "-ngl", "99", "--n-cpu-moe", NCPUMOE, "--load-mode", config.LOADMODE, "--fit", "off", "--jinja",
                "--host", "127.0.0.1", "--port", String(PORT)],
        { cwd: ROOT, detached: true, stdio: "ignore", windowsHide: true }).on("error", () => {}).unref();
  return null;
}

// ---------- talking to it ----------
export function post(route: string, body: object, signal: AbortSignal | undefined, timeout: number): Promise<http.IncomingMessage> {
  return new Promise((resolve, reject) => {
    const req = http.request(SERVER + route, { method: "POST", headers: { "Content-Type": "application/json" },
                                               agent: LOCAL, signal, timeout }, resolve);
    req.on("timeout", () => req.destroy(new Error(`no answer in ${timeout / 1000} s`)));
    req.on("error", reject);
    req.end(JSON.stringify(body));
  });
}

export async function readAll(res: http.IncomingMessage): Promise<string> {
  res.setEncoding("utf8");
  let text = "";
  for await (const chunk of res) text += chunk;
  return text;
}

/** Whether the server has loaded the model and takes requests. */
export function serverReady(): Promise<boolean> {
  return new Promise(resolve => {
    const req = http.get(SERVER + "/health", { agent: LOCAL, timeout: 2000 }, res =>
      readAll(res).then(body => resolve(res.statusCode === 200 && body.includes('"ok"')), () => resolve(false)));
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", () => resolve(false));
  });
}

/** Whether a llama-server process is running. */
export function running(): Promise<boolean> {
  return new Promise(resolve => execFile("tasklist", ["/FI", `IMAGENAME eq ${PROCESS}`, "/NH"], { windowsHide: true },
                                         (err, out) => resolve(!err && out.includes(PROCESS))));
}

// ---------- stopping it ----------
/** When this agent ends, however it ends (quitting, Ctrl+C, or killed along with its closed window, where no
 *  exit handler runs), a hidden stopper outside the window stops the server, unless another agent is still running. */
export function watchServer(): void {
  fs.mkdirSync(AGENTS, { recursive: true });
  fs.writeFileSync(path.join(AGENTS, String(process.pid)), "");
  spawn(process.execPath, [import.meta.filename, String(process.pid)], { detached: true, stdio: "ignore", windowsHide: true })
    .on("error", () => console.log("2b: couldn't start the server's stopper: stop llama-server in Task Manager after quitting"))
    .unref();
}

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === "EPERM";
  }
}

// The stopper.
if (import.meta.main) {
  const pid = Number(process.argv[2]);
  while (alive(pid)) await new Promise(r => setTimeout(r, 1000));
  let others = 0;
  for (const name of fs.readdirSync(AGENTS)) {
    if (Number(name) !== pid && alive(Number(name))) others++;
    else fs.rmSync(path.join(AGENTS, name), { force: true });
  }
  if (!others) execFile("taskkill.exe", ["/F", "/IM", PROCESS], { windowsHide: true }, () => {});
}
