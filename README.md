# 2B — portable local gpt-oss-20b

Everything lives in this folder on the SSD: Git Bash, Node.js, the model, llama.cpp and a
small coding agent (TypeScript, run by Node). Plug the SSD into any Windows computer and
double-click. Nothing is installed on the computer itself. No cloud, no API cost.

## Getting started
1. Double-click **install** (once). It sets up four components, all inside `runtime/` and all the
   same way (listed at the top of `scripts/install.ts`, Node.js in `install.cmd`: destination, URL):

   | Component | Goes to | Size |
   |---|---|---|
   | Git for Windows, portable (Git Bash) | `runtime/git/` | ~60 MB |
   | Node.js | `runtime/node/` | ~30 MB |
   | llama.cpp, CUDA build | `runtime/llama/` | ~640 MB |
   | the model, gpt-oss-20b | `runtime/model/_model.gguf` | 12.1 GB |

   Each one is downloaded, then unpacked into place. Run install again any time: it only
   fetches what's missing, and an interrupted download resumes.
2. Double-click **app**. It opens Git Bash in your home folder and starts 2B right away.
   Quitting it (`/exit`) leaves a normal Git Bash prompt, with `2b`, `node` and `npm` ready:
   `cd` to a project and type `2b` to work there.

The computer needs an NVIDIA GPU, with a driver recent enough for CUDA 12.4 (`nvidia-smi`
shows "CUDA Version: 12.4" or higher). CUDA itself doesn't need to be installed: llama.cpp
comes with its own.
Install also writes `configs/llama.conf` if it doesn't exist yet: one settings file for every
computer, explained by its own comments, estimated from this computer's VRAM and RAM. On a
different GPU, edit it by hand.

## The 2b command
In the app, `2b` starts the coding agent in the current folder. It has no options: everything
else happens inside the agent. It starts the model server in the background (no window; the first
session takes ~30 s to load the model, shown on a loading screen whose estimate comes from the last
load), and stops it once the last 2B window is done, however it ends (`/exit`, Ctrl+C, or
closing the window).

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
Pasting several lines puts them into one message: the line shows `[pasted #1: 12 lines]` until you
press Enter. Answers are rendered as markdown (headings, lists, tables, code) as they stream.

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
apply from the next `/clear`, edits to the code from the next `2b`. There's no build
step: Node runs the `.ts` files as they are, so type annotations are not checked. It's a
20B model: good for small, scoped edits; keep tasks tight.

## When something breaks
- **The server doesn't start (out of memory):** raise `NCPUMOE` in `configs/llama.conf`.
- **A component is broken:** delete it (see Getting started for where each one goes) and
  double-click install again.

To upgrade a component, change its URL in `scripts/install.ts` (Node.js: in `install.cmd`), delete the
old copy, and double-click install. Node.js must stay 22.18+ to run the agent's `.ts` files as they are.
Downloads, and the agent's WebSearch / WebFetch, use the Windows system proxy (e.g. Clash)
automatically.

## Layout
```
install.cmd             double-click once: downloads Node.js, then runs scripts/install.ts with it
app.cmd                 double-click: opens the portable Git Bash in ~ and starts 2b in it
scripts/
  install.ts            the installer (run by install.cmd): downloads the components, the app's commands,
                        the first configs/llama.conf
agent/                  the coding agent (TypeScript; Node built-ins only, no npm packages)
  main.ts               the agent command (`2b`): the ▶ prompt and its /commands
  server.ts             the model server: its settings, starting it, stopping it after the last window
  proxy.ts              the Windows proxy (e.g. Clash), for fetch and the commands the agent runs
  agent.ts              one conversation: instructions, model calls, running tools, context
  terminal.ts           the terminal: layout, spinner, diffs; questions, pastes, Ctrl+C
  markdown.ts           the model's answers, rendered as markdown while they stream
  loading.ts            the loading screen, until the model server is ready
  theme.ts              the agent's colors (made for the background in configs/mintty.conf)
  text.ts               text helpers ({placeholders}, splitting lines)
  tools/                one file per tool: its schema, prompt tip, messages and code
    index.ts            the list of tools, in the order the model sees them
    _shared.ts          what several tools use (files, running commands, fetching pages)
  prompt/               what the model reads (besides the tools):
    identity.md         who the model is (replaces the template's "You are ChatGPT" line)
    instructions.md     how to work, rules, environment, tool tips
    messages.toml       the loop's own notices to the model (denied, bad arguments, ...)
                        (the chat template inside the model file wraps it all into the model's format)
runtime/                everything install downloads (delete it to start over):
  git/                  portable Git for Windows (Git Bash)
  node/                 portable Node.js
  llama/                llama.cpp (CUDA build, with its CUDA runtime)
  model/_model.gguf     the model
  downloads/            unfinished downloads (resumed by the next install)
configs/
  llama.conf            server settings (GPU/CPU split, context); made by install, edit by hand
  mintty.conf           the app terminal's look: colours, font (wins over ~/.minttyrc)
logs/                   server.log, load-seconds (how long the last model load took),
                        agents/ (one file per running agent, so the last one stops the server)
```
