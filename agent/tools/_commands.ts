// Running a command for the tools that do: Bash, PowerShell, Git, GitHub.
import { spawnSync } from "node:child_process";
import type { Session } from "./_types.ts";
import { fill } from "../text.ts";

const COMMAND_TIMEOUT = 180;   // seconds
// No pagers, colors or interactive prompts in commands the agent runs (they would hang or clutter output).
const QUIET = { GIT_PAGER: "cat", PAGER: "cat", GH_PAGER: "", NO_COLOR: "1",
                GH_PROMPT_DISABLED: "1", GIT_TERMINAL_PROMPT: "0" };
const MESSAGES = {
  command_timeout: "Error: command timed out after {seconds} s.",
  command_output: "{output}\n[exit code {code}]",
  command_no_output: "[no output, exit code {code}]",
};

export async function runCommand(ag: Session, argv: string[], ask = true): Promise<string> {
  if (ask) {
    const denied = await ag.confirm("this command");
    if (denied) return denied;
  }
  const r = spawnSync(argv[0], argv.slice(1), {
    cwd: ag.root, encoding: "utf8", timeout: COMMAND_TIMEOUT * 1000, stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, ...QUIET }, maxBuffer: 64 * 1024 * 1024, windowsHide: true,
  });
  if ((r.error as NodeJS.ErrnoException | undefined)?.code === "ETIMEDOUT") {
    return fill(MESSAGES.command_timeout, { seconds: COMMAND_TIMEOUT });
  }
  if (r.error) throw r.error;
  const code = r.status ?? r.signal;
  const out = (r.stdout + (r.stderr ? "\n" + r.stderr : "")).trimEnd().replace(/^\n+/, "");   // keep leading spaces (git status)
  return out ? fill(MESSAGES.command_output, { output: out, code }) : fill(MESSAGES.command_no_output, { code });
}

/** Words of a command line, like Python's shlex.split: quotes and backslashes as in a POSIX shell. */
export function shlexSplit(s: string): string[] {
  const words: string[] = [];
  let word = "", inWord = false, quote = "";
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quote === "'") {
      if (c === "'") quote = ""; else word += c;
    } else if (quote === '"') {
      if (c === '"') quote = "";
      else if (c === "\\" && (s[i + 1] === '"' || s[i + 1] === "\\")) word += s[++i];
      else word += c;
    } else if (c === "'" || c === '"') {
      quote = c;
      inWord = true;
    } else if (c === "\\") {
      if (i + 1 >= s.length) throw new SyntaxError("No escaped character");
      word += s[++i];
      inWord = true;
    } else if (/\s/.test(c)) {
      if (inWord) words.push(word);
      word = "";
      inWord = false;
    } else {
      word += c;
      inWord = true;
    }
  }
  if (quote) throw new SyntaxError("No closing quotation");
  if (inWord) words.push(word);
  return words;
}
