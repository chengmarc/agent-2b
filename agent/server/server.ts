// The model server, llama-server (llama.cpp, the process that runs the model): its settings,
// starting it for the agent, and talking to it over HTTP. stopper.ts stops it once the last 2B window is done.
import { execFile, spawn } from "node:child_process";
import * as fs from "node:fs";
import * as http from "node:http";
import * as os from "node:os";
import * as path from "node:path";
import { LLAMA, LOG, MODEL, ROOT } from "../paths.ts";

const PORT = 8080;
export const SERVER = `http://127.0.0.1:${PORT}`;
export const PROCESS = path.basename(LLAMA);   // its name in the task list
const LOCAL = new http.Agent();   // talks to llama-server directly, never through HTTPS_PROXY

export const ALIAS = "gpt-oss-20b";   // the model's name in the API
export const CTX = 65536;   // server context window, in tokens
// Keeping the CPU-side experts in RAM (not memory-mapped) is much faster, if RAM allows (~14 GB).
const LOADMODE = os.totalmem() >= 14000 * 2 ** 20 ? "none" : "mmap";

/** Start the server in the background, or say why it can't be. It only launches it: the agent is on screen
 *  at once, and its loading screen waits for the model (loading.ts). */
export function startServer(): string | null {
  if (!fs.existsSync(LLAMA)) return "llama.cpp is missing. Double-click install";
  if (!fs.existsSync(MODEL)) return "the model is missing. Double-click install";
  fs.mkdirSync(path.dirname(LOG), { recursive: true });
  // A hidden process of its own (no window), not tied to this one; if it fails, the loading screen says so.
  // --fit on: llama.cpp splits the model between GPU and CPU itself, measured against the VRAM free right now
  // (keeping 1 GB spare); the context is set, so it isn't shrunk to fit.
  // --jinja: format every message with the chat template inside the model file.
  spawn(LLAMA, ["-m", MODEL, "--log-file", LOG, "--alias", ALIAS, "-c", String(CTX), "--parallel", "1",
                "--fit", "on", "--load-mode", LOADMODE, "--jinja",
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
