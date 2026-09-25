// The model server, llama-server (llama.cpp, the process that runs the model): its settings (configs/llama.conf),
// starting it for the agent, and stopping it once the last 2B window is done.
// Run as a script (node server.ts PID), this file is that stopper: see watchServer.
import { execFile, execFileSync, spawn } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

export const ROOT = path.join(import.meta.dirname, "..");
export const MODEL = path.join(ROOT, "runtime", "model", "_model.gguf");
export const LOG = path.join(ROOT, "logs", "server.log");
const LLAMA = path.join(ROOT, "runtime", "llama", "llama-server.exe");   // llama.cpp, CUDA build
const CONF = path.join(ROOT, "configs", "llama.conf");   // one set of settings; retweak by hand on a new computer
const AGENTS = path.join(ROOT, "logs", "agents");        // one empty file per running agent, named by its pid
const PORT = 8080;
export const SERVER = `http://127.0.0.1:${PORT}`;

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
let config: Record<string, string>;
export let CTX: number;                  // server context window
export let NCPUMOE: string | undefined;  // expert layers on the CPU
function load(): void {
  config = readConf();
  CTX = Number(config.CTX) || 32768;
  NCPUMOE = config.NCPUMOE;
}
load();

/** Write a first configs/llama.conf, estimated from this computer's VRAM and RAM; or say why it can't be. */
function estimateConf(): string | null {
  let vram = 0;
  try {
    const out = execFileSync("nvidia-smi", ["--query-gpu=memory.total", "--format=csv,noheader,nounits"],
                             { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], windowsHide: true });
    vram = parseInt(out.trim().split(/\r?\n/)[0]) || 0;
  } catch {}
  if (!vram) return "no NVIDIA GPU found (nvidia-smi): 2B needs one, with its driver installed";
  const ramMb = Math.round(os.totalmem() / 2 ** 20);
  // ~3 GB for attention, KV cache (32k) and buffers; ~0.52 GB per expert layer; 24 layers total;
  // plus 2 layers of margin, since nothing is measured.
  const n = Math.max(0, Math.min(24, 24 - Math.floor((vram - 3000) / 520) + 2));
  // Keeping the CPU-side experts in RAM (not memory-mapped) is much faster, if RAM allows.
  const mode = ramMb >= 14000 ? "none" : "mmap";
  const today = new Date().toLocaleDateString("en-CA");   // yyyy-mm-dd
  fs.writeFileSync(CONF, `# llama server settings (estimated by 2b on ${process.env.COMPUTERNAME || os.hostname()} from ${vram} MB VRAM and ${ramMb} MB RAM, ${today}).
# One file for every computer: on a new one, check these and edit by hand.
#   NCPUMOE   expert layers kept on the CPU, 0-24. Lower is faster but needs more VRAM;
#             raise it if the server fails to start (out of memory).
#   LOADMODE  none = copy CPU-side experts into RAM (fast, needs ~14 GB RAM); mmap = read them from disk
#   CTX       context window in tokens
NCPUMOE=${n}
LOADMODE=${mode}
CTX=32768
`);
  console.log(`Wrote configs/llama.conf, estimated from ${vram} MB VRAM and ${ramMb} MB RAM: NCPUMOE=${n} LOADMODE=${mode} CTX=32768`);
  return null;
}

/** Start the server in the background, or say why it can't be. It only launches it: the agent is on screen
 *  at once, and its loading screen waits for the model (loading.ts). */
export function startServer(): string | null {
  if (!fs.existsSync(LLAMA)) return "llama.cpp is missing. Double-click install";
  if (!fs.existsSync(MODEL)) return "the model is missing. Double-click install";
  if (!fs.existsSync(CONF)) {
    const problem = estimateConf();
    if (problem) return problem;
    load();
  }
  if (!NCPUMOE || !config.LOADMODE) return "configs/llama.conf needs NCPUMOE and LOADMODE (delete it for a new estimate)";
  fs.mkdirSync(path.dirname(LOG), { recursive: true });
  // A hidden process of its own (no window), not tied to this one; if it fails, the loading screen says so.
  // --jinja: format every message with the chat template inside the model file.
  spawn(LLAMA, ["-m", MODEL, "--log-file", LOG, "--alias", "gpt-oss-20b", "-c", String(CTX), "--parallel", "1",
                "-ngl", "99", "--n-cpu-moe", NCPUMOE, "--load-mode", config.LOADMODE, "--fit", "off", "--jinja",
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
