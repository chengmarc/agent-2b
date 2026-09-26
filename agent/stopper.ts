// The server's stopper: when this agent ends, however it ends (quitting, Ctrl+C, or killed along with its
// closed window, where no exit handler runs), a hidden process outside the window stops llama-server,
// unless another agent is still running. Each running agent leaves an empty file named by its pid in AGENTS.
// Run as a script (node stopper.ts PID), this file is that process.
import { execFile, spawn } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { AGENTS } from "./paths.ts";
import { PROCESS } from "./server.ts";

/** Register this agent and start its stopper. */
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
