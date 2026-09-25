// The model server, llama-server (llama.cpp, the process that runs the model): its settings (configs/llama.conf),
// starting it for the agent, and stopping it once the last 2B window is done.
// Run as a script (node server.ts PID), this file is that stopper: see watchServer.
import { execFile, spawn } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

export const ROOT = path.join(import.meta.dirname, "..");
export const MODEL = path.join(ROOT, "runtime", "model", "_model.gguf");
export const LOG = path.join(ROOT, "logs", "server.log");
const LLAMA = path.join(ROOT, "runtime", "llama", "llama-server.exe");   // llama.cpp, CUDA build
const CONF = path.join(ROOT, "configs", "llama.conf");   // one set of settings; retweak by hand on a new computer
const AGENTS = path.join(ROOT, "logs", "agents");        // one empty file per running agent, named by its pid
const PORT = 8080;
export const SERVER = `http://127.0.0.1:${PORT}`;

/** configs/llama.conf: KEY=value lines and # comments (install writes it). Empty if it's missing. */
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
const CONFIG = readConf();
export const CTX = Number(CONFIG.CTX) || 32768;   // server context window
export const NCPUMOE = CONFIG.NCPUMOE;            // expert layers on the CPU

/** Start the server in the background, or say why it can't be. It only launches it: the agent is on screen
 *  at once, and its loading screen waits for the model (loading.ts). */
export function startServer(): string | null {
  if (!fs.existsSync(LLAMA)) return "llama.cpp is missing. Double-click install";
  if (!fs.existsSync(MODEL)) return "the model is missing. Double-click install";
  if (!fs.existsSync(CONF)) return "configs/llama.conf is missing. Double-click install";
  if (!NCPUMOE || !CONFIG.LOADMODE) return "configs/llama.conf needs NCPUMOE and LOADMODE (delete it and double-click install)";
  fs.mkdirSync(path.dirname(LOG), { recursive: true });
  // A hidden process of its own (no window), not tied to this one; if it fails, the loading screen says so.
  // --jinja: format every message with the chat template inside the model file.
  spawn(LLAMA, ["-m", MODEL, "--log-file", LOG, "--alias", "gpt-oss-20b", "-c", String(CTX), "--parallel", "1",
                "-ngl", "99", "--n-cpu-moe", NCPUMOE, "--load-mode", CONFIG.LOADMODE, "--fit", "off", "--jinja",
                "--host", "127.0.0.1", "--port", String(PORT)],
        { cwd: ROOT, detached: true, stdio: "ignore", windowsHide: true }).on("error", () => {}).unref();
  return null;
}

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
  if (!others) execFile("taskkill.exe", ["/F", "/IM", "llama-server.exe"], { windowsHide: true }, () => {});
}
