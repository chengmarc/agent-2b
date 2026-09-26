// Where everything sits on the drive: what install.cmd downloads (runtime/), the settings the first 2b
// writes (configs/), and what the agent keeps between runs (logs/). app.cmd and install.cmd name the same places.
import * as path from "node:path";

export const ROOT = path.join(import.meta.dirname, "..");

export const LLAMA = path.join(ROOT, "runtime", "llama", "llama-server.exe");   // llama.cpp, CUDA build
export const MODEL = path.join(ROOT, "runtime", "model", "_model.gguf");
export const GIT_BASH = path.join(ROOT, "runtime", "git", "usr", "bin", "bash.exe");

export const CONF = path.join(ROOT, "configs", "llama.conf");   // one set of settings; retweak by hand on a new computer

export const LOG = path.join(ROOT, "logs", "server.log");
export const LOAD_SECONDS = path.join(ROOT, "logs", "load-seconds");   // how long the last load took, for the next estimate
export const AGENTS = path.join(ROOT, "logs", "agents");               // one empty file per running agent, named by its pid
