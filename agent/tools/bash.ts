// Bash: run a command in Git Bash, after asking.
import * as fs from "node:fs";
import * as path from "node:path";
import type { Session } from "./index.ts";
import { runCommand } from "./_shared.ts";

// The portable Git Bash install sets up; else a system-wide one.
const PORTABLE = path.join(import.meta.dirname, "..", "..", "runtime", "git", "usr", "bin", "bash.exe");
const BASH = fs.existsSync(PORTABLE) ? PORTABLE : process.platform === "win32" ? "C:\\Program Files\\Git\\bin\\bash.exe" : "/bin/bash";

export const SCHEMA = {
  name: "Bash",
  description: "Run a bash command in the project root; returns stdout+stderr and exit code.",
  parameters: { type: "object", properties: {
    command: { type: "string" },
  }, required: ["command"] },
};
export const TIP = "run the code and its tests, and other commands. Runs in Git Bash, starting in the project root. " +
  "Never run interactive or never-ending commands (servers, watchers, editors).";

export async function run(ag: Session, args: { command: string }): Promise<string> {
  return runCommand(ag, [BASH, "-c", args.command]);
}
