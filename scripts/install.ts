// Run by install.cmd, once it has Node.js (runtime/node): sets up everything else 2B needs, inside this folder.
// Run again any time.
//  1. downloads whatever components are missing (Git Bash, llama.cpp, the model),
//     each one the same way: download (resumable) -> unpack into <dest>.new -> rename to <dest>
//  2. sets up 2b, node and npm in the portable Git Bash that app.cmd opens
//  3. writes configs/llama.conf, if there isn't one, estimated from this computer's VRAM and RAM
import { execFileSync, spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { useProxy } from "../agent/proxy.ts";

const ROOT = path.join(import.meta.dirname, "..");
const SYS = path.join(process.env.SystemRoot || "C:\\Windows", "System32");
const CURL = path.join(SYS, "curl.exe");   // Windows' own, not Git's
const TAR = path.join(SYS, "tar.exe");     // Windows' own; unpacks .zip
const STAGING = path.join(ROOT, "runtime", "downloads");   // partial downloads wait here, so they resume

class InstallError extends Error {}

/** Runs a program in this console (its progress shows as is); its exit code. */
function run(exe: string, args: string[]): number {
  return spawnSync(exe, args, { stdio: "inherit" }).status ?? 1;
}

// ---- the GPU: llama.cpp here is the CUDA build, so an NVIDIA GPU (and its driver) is required ----
function vramMb(): number {
  try {
    const out = execFileSync("nvidia-smi", ["--query-gpu=memory.total", "--format=csv,noheader,nounits"],
                             { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    return parseInt(out.trim().split(/\r?\n/)[0]) || 0;
  } catch {
    return 0;
  }
}

// ---- 1. components ----
// Everything install downloads (all into runtime/) besides Node.js, which install.cmd fetches first: where
// it goes, its URL. Rows with the same destination are one component. A .zip or .7z.exe is unpacked into
// the destination folder; anything else is saved as the destination file.
// To upgrade: change the URL, delete the old copy, double-click install.
const COMPONENTS: [string, string][] = [
  // Git for Windows 2.55.0.5, portable (Git Bash)                                           ~60 MB
  ["runtime/git",               "https://github.com/git-for-windows/git/releases/download/v2.55.0.windows.5/PortableGit-2.55.0.5-64-bit.7z.exe"],
  // llama.cpp b10434, CUDA 12.4 build + its CUDA runtime (NVIDIA driver with CUDA 12.4+)    ~640 MB
  ["runtime/llama",             "https://github.com/ggml-org/llama.cpp/releases/download/b10434/llama-b10434-bin-win-cuda-12.4-x64.zip"],
  ["runtime/llama",             "https://github.com/ggml-org/llama.cpp/releases/download/b10434/cudart-llama-bin-win-cuda-12.4-x64.zip"],
  // gpt-oss-20b, MXFP4 (ggml-org/gpt-oss-20b-GGUF)                                          12.1 GB
  ["runtime/model/_model.gguf", "https://huggingface.co/ggml-org/gpt-oss-20b-GGUF/resolve/ef9b12f2ff56c69cf32153a02784e7a3c88bf524/gpt-oss-20b-MXFP4.gguf"],
];

function install(name: string, urls: string[]): void {
  const dest = path.join(ROOT, name);
  if (fs.existsSync(dest)) return;   // only a finished install gets renamed to dest
  console.log(`\n== ${name} ==`);
  fs.mkdirSync(STAGING, { recursive: true });
  const files = urls.map(url => path.join(STAGING, url.split("/").pop()!));

  urls.forEach((url, i) => {
    const file = files[i];
    if (fs.existsSync(file)) return;   // a finished download; an unfinished one is still <file>.part
    console.log(`Downloading ${path.basename(file)}...`);
    // -C -: resume a partial download; a stalled connection is dropped and retried.
    const code = run(CURL, ["-L", "--fail", "--retry", "5", "--retry-all-errors", "-C", "-", "--speed-limit", "10000",
                            "--speed-time", "60", "--progress-bar", "-o", `${file}.part`, url]);
    if (code !== 0) throw new InstallError(`downloading ${path.basename(file)} failed; double-click install again to resume`);
    fs.renameSync(`${file}.part`, file);
  });

  const tmp = `${dest}.new`;
  fs.rmSync(tmp, { recursive: true, force: true });
  for (const file of files) {
    let code = 0;
    if (file.endsWith(".zip")) {
      fs.mkdirSync(tmp, { recursive: true });
      code = run(TAR, ["-xf", file, "-C", tmp]);
    } else if (file.endsWith(".7z.exe")) {   // a self-extracting 7-Zip archive
      fs.mkdirSync(tmp, { recursive: true });
      code = run(file, [`-o${tmp}`, "-y"]);
    } else {
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.renameSync(file, tmp);
    }
    if (code !== 0) throw new InstallError(`unpacking ${path.basename(file)} failed`);
  }
  // A zip that holds a single folder (e.g. llama-b10434/): use what's inside it.
  const inner = fs.statSync(tmp).isDirectory() ? fs.readdirSync(tmp, { withFileTypes: true }) : [];
  if (inner.length === 1 && inner[0].isDirectory()) {
    const only = path.join(tmp, inner[0].name);
    for (const f of fs.readdirSync(only)) fs.renameSync(path.join(only, f), path.join(tmp, f));
    fs.rmdirSync(only);
  }
  fs.renameSync(tmp, dest);
  for (const file of files) fs.rmSync(file, { force: true });
  console.log(`Ready: ${name}`);
}

// ---- 2. the app's commands ----
// This Git Bash is <2b>/runtime/git, so the 2b folder is two up from its /. (bash reads it: LF endings.)
const PROFILE = `# Written by install.cmd: the 2b command (agent/main.ts), and node and npm first on PATH,
# in this portable Git Bash.
TWOB_ROOT="$(cygpath -u "$(dirname "$(dirname "$(cygpath -m /)")")")"
export PATH="$TWOB_ROOT/runtime/node:$PATH"
2b() { node "$TWOB_ROOT/agent/main.ts" "$@"; }
# app.cmd sets TWOB_AUTORUN: its window starts with the agent, as if \`2b\` had been typed at the
# first prompt; quitting it leaves a normal prompt.
if [ -n "\${TWOB_AUTORUN-}" ] && [[ $- == *i* ]]; then
  unset TWOB_AUTORUN
  _prompt=\${PS1@P}; printf '%s2b\\n' "\${_prompt//[$'\\001\\002']/}"; unset _prompt
  2b
fi
`;

// ---- 3. configs/llama.conf ----
function writeConf(vram: number): void {
  const conf = path.join(ROOT, "configs", "llama.conf");
  if (fs.existsSync(conf)) {
    console.log("\nKeeping configs\\llama.conf (if this computer's GPU differs, edit it by hand):");
    for (const line of fs.readFileSync(conf, "utf8").split(/\r?\n/)) if (line && !line.startsWith("#")) console.log(`  ${line}`);
    return;
  }
  const ramMb = Math.round(os.totalmem() / 2 ** 20);
  // ~3 GB for attention, KV cache (32k) and buffers; ~0.52 GB per expert layer; 24 layers total;
  // plus 2 layers of margin, since nothing is measured.
  const n = Math.max(0, Math.min(24, 24 - Math.floor((vram - 3000) / 520) + 2));
  // Keeping the CPU-side experts in RAM (not memory-mapped) is much faster, if RAM allows.
  const load = ramMb >= 14000 ? "none" : "mmap";
  const today = new Date().toLocaleDateString("en-CA");   // yyyy-mm-dd
  fs.writeFileSync(conf, `# llama server settings (estimated by install on ${process.env.COMPUTERNAME || os.hostname()} from ${vram} MB VRAM and ${ramMb} MB RAM, ${today}).
# One file for every computer: on a new one, check these and edit by hand.
#   NCPUMOE   expert layers kept on the CPU, 0-24. Lower is faster but needs more VRAM;
#             raise it if the server fails to start (out of memory).
#   LOADMODE  none = copy CPU-side experts into RAM (fast, needs ~14 GB RAM); mmap = read them from disk
#   CTX       context window in tokens
NCPUMOE=${n}
LOADMODE=${load}
CTX=32768

`);
  console.log(`\nWrote configs\\llama.conf: NCPUMOE=${n} LOADMODE=${load} CTX=32768`);
}

try {
  const vram = vramMb();
  if (!vram) throw new InstallError("no NVIDIA GPU found (nvidia-smi): 2B needs one, with its driver installed");
  useProxy();   // curl reads HTTPS_PROXY, but not the Windows proxy setting (e.g. Clash)
  if (process.env.HTTPS_PROXY) console.log(`(using the proxy ${process.env.HTTPS_PROXY})`);

  const groups = new Map<string, string[]>();
  for (const [dest, url] of COMPONENTS) groups.set(dest, [...groups.get(dest) ?? [], url]);
  for (const [dest, urls] of groups) install(dest, urls);
  if (fs.existsSync(STAGING) && !fs.readdirSync(STAGING).length) fs.rmdirSync(STAGING);

  fs.writeFileSync(path.join(ROOT, "runtime", "git", "etc", "profile.d", "2b.sh"), PROFILE);
  writeConf(vram);
} catch (e) {
  if (!(e instanceof InstallError)) throw e;
  console.error(`\n${e.message}`);
  process.exit(1);
}
