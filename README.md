# Salieri — portable local gpt-oss-20b

Everything lives in this folder on the SSD: Git Bash, Node.js, the model, llama.cpp and a
small coding agent (TypeScript, run by Node). Plug the SSD into any Windows computer and
double-click. Nothing is installed on the computer itself. No cloud, no API cost.

## Getting started
1. Double-click **install** (once). It downloads, into this folder, whatever is missing:
   portable Git for Windows (Git Bash), Node.js, the llama.cpp build this computer's GPU
   needs, and the model (11.5 GB). Run it again any time: it only fetches what's missing,
   and an interrupted model download resumes.
2. Double-click **app**. It opens Git Bash with `salieri`, `node` and `npm` ready. `cd` to a
   project and type `salieri`.

The only thing the computer needs is a GPU driver (NVIDIA uses CUDA; anything else uses Vulkan).
Install also writes `salieri.conf` if it doesn't exist yet: one settings file for every
computer, explained by its own comments, estimated from this computer's VRAM and RAM. On a
different GPU, edit it by hand.

## Commands (in the app's Git Bash)
```
salieri                    coding agent in the current folder
salieri --effort high      ... starting at another reasoning effort (low | medium | high; default medium)
salieri chat               browser chat (http://127.0.0.1:8080)
salieri status             what's installed, the settings, server state
salieri stop               stop the model server (frees VRAM and ~8 GB RAM)
salieri setup              download whatever is missing (what install runs after fetching Git Bash)
salieri help               these commands (also -h, --help)
```
The agent starts the server in the background (no window) and stops it when you
exit, freeing VRAM and RAM; each new session takes ~30 s to load the model.
`salieri chat` leaves its server running until `salieri stop`.

## In the agent
```
/help                      these commands
/clear                     start a new conversation (re-reads the text files in agent/prompt/)
/effort low|medium|high    reasoning effort
/tokens                    context used so far
/prompt                    the exact text the model reads
/exit                      quit (also Ctrl+D)
Ctrl+C                     drop the current request; at the prompt, quit
```
Before an edit, a command or a fetch, the agent asks `y / n / a`: `a` (always) approves
everything for the rest of the session; after `n` you can tell the model why.

## Tools the model can use
| Tool | Does | Asks first |
|---|---|---|
| Read | read a file, as numbered lines | no |
| Edit | replace an exact snippet in a file (shows the diff) | yes |
| Write | create or overwrite a file (shows the diff) | yes |
| Glob | find files by name pattern | no |
| Grep | search file contents with a regex | no |
| Bash | run a command in Git Bash | yes |
| PowerShell | run a Windows PowerShell 5.1 command | yes |
| WebSearch | search the web (DuckDuckGo) | no |
| WebFetch | read a web page as text | yes |
| Git | run git | only if it changes something |
| GitHub | run the gh CLI | only if it changes something |

The agent streams the model's thinking dimmed and reads the repo's `AGENTS.md` or
`CLAUDE.md`. Everything the model reads is a text file in `agent/prompt/` (see Layout),
except each tool's schema, tip and messages, which sit in its own file in `agent/tools/`.
Edits to the text files
apply from the next `/clear`, edits to the code from the next `salieri`. There's no build
step: Node runs the `.ts` files as they are, so type annotations are not checked. It's a
20B model: good for small, scoped edits; keep tasks tight.

## When something breaks
- **The server doesn't start (out of memory):** raise `NCPUMOE` in `salieri.conf`.
- **A download is broken, or you changed a version:** delete the old copy
  (`runtime/git/`, `runtime/node/`, `engine/cuda/` or `engine/vulkan/`, `model/_model.gguf`)
  and double-click install again, which downloads whatever is missing. Git, Node.js and the
  model are checksum-verified, and an interrupted model download resumes.

Versions are pinned in `scripts/versions.sh` (`GIT_URL`, `NODE_VERSION`, `LLAMA_TAG`, `MODEL_URL`,
each with its checksum; Node must stay 22.18+ to run the agent's `.ts` files as they are).
Downloads, and the agent's WebSearch / WebFetch, use the Windows system proxy (e.g. Clash)
automatically.

## Layout
```
install.cmd             double-click once: downloads everything (runs scripts/install.ps1)
app.cmd                 double-click: opens the portable Git Bash, with salieri, node and npm on PATH
bin/salieri             the `salieri` command (bash): help text, and which script runs each command
scripts/                the rest of the command, one file per job:
  install.ps1           fetches portable Git (Windows has no bash yet), then runs salieri setup
  versions.sh           pinned download versions and checksums
  common.sh             paths, helpers, proxy + download
  server.sh             start / stop the model server
  download.sh           downloading Node.js, llama.cpp and the model (used by setup)
  setup.sh              salieri setup (incl. the first salieri.conf and the app's PATH), salieri status
agent/                  the coding agent (TypeScript; Node built-ins only, no npm packages)
  main.ts               the agent command: --effort, the ▶ prompt and its /commands
  agent.ts              one conversation: instructions, model calls, running tools, context
  terminal.ts           the terminal: colors, layout, diffs; questions, pasted lines, Ctrl+C
  text.ts               text helpers ({placeholders}, splitting lines)
  tools/                one file per tool: its schema, prompt tip, messages and code
    index.ts            the list of tools, in the order the model sees them
    _shared.ts          what several tools use (files, running commands, fetching pages)
  prompt/               what the model reads (besides the tools):
    identity.md         who the model is (replaces the template's "You are ChatGPT" line)
    instructions.md     how to work, rules, environment, tool tips
    messages.toml       the loop's own notices to the model (denied, bad arguments, ...)
                        (the chat template inside the model file wraps it all into the model's format)
runtime/git/            portable Git for Windows (Git Bash)
runtime/node/           portable Node.js
model/_model.gguf       the model
engine/cuda/            llama.cpp for NVIDIA (engine/vulkan/ for other GPUs)
salieri.conf            server settings (GPU/CPU split, context); edit by hand
logs/                   server.log
```
