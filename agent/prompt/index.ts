// What the model reads besides the tools, from the text files beside this one: identity.md,
// instructions.md (filled with the tool tips and a line about the machine), messages.toml (the loop's own texts).
// The server wraps it all in the model's format with the chat template inside the model file.
// Read at every new conversation, so /clear picks up edits to the text files.
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { TOOLS } from "../tools/index.ts";
import { fill, splitLines } from "../text.ts";

const DEV_COMMANDS = ["python", "py", "node", "npm", "pnpm", "yarn", "uv", "cargo", "go", "java", "dotnet", "docker", "make", "gcc"];

const read = (name: string) => fs.readFileSync(path.join(import.meta.dirname, name), "utf8");
const isFile = (p: string) => fs.statSync(p, { throwIfNoEntry: false })?.isFile() ?? false;

/** messages.toml: `key = "text"` lines (TOML basic strings) and # comments. */
export function messages(): Record<string, string> {
  const out: Record<string, string> = {};
  splitLines(read("messages.toml")).forEach((line, n) => {
    const t = line.trim();
    if (!t || t.startsWith("#")) return;
    const m = t.match(/^([\w-]+)\s*=\s*("(?:[^"\\]|\\.)*")\s*(?:#.*)?$/);
    if (!m) throw new Error(`messages.toml line ${n + 1}: expected key = "text"`);
    out[m[1]] = JSON.parse(m[2]);
  });
  return out;
}

/** Replaces the chat template's built-in "You are ChatGPT..." line in the system message, which outranks the
 *  developer message. The trailing \n leaves a blank line before the template's own "Knowledge cutoff" line. */
export function identity(): string {
  return read("identity.md").trim() + "\n";
}

function which(cmd: string): string | null {
  const exts = process.platform === "win32" ? (process.env.PATHEXT || ".COM;.EXE;.BAT;.CMD").split(";") : [""];
  for (const dir of (process.env.PATH || "").split(path.delimiter))
    for (const ext of exts) {
      const p = path.join(dir, cmd + ext);
      if (isFile(p)) return p;
    }
  return null;
}

/** One line about the machine; the model finds out about the project itself with its tools. */
function environment(): string {
  // WindowsApps holds the Microsoft Store "python" stubs, which only open the Store.
  const found = DEV_COMMANDS.filter(c => !(which(c) ?? "WindowsApps").includes("WindowsApps"));
  return `${os.version()}; Bash runs Git Bash, PowerShell runs Windows PowerShell 5.1; ` +
         `installed: ${found.join(", ") || "none of the usual dev tools"}`;
}

/** The API's "system" message (the chat template turns it into the developer message), with the project's
 *  own instructions, if the repo at root has them. */
export function instructions(root: string, project_instructions: string): string {
  const tips = TOOLS.map(t => `- ${t.SCHEMA.name}: ${t.TIP}`).join("\n");
  let text = fill(read("instructions.md"), { tool_tips: tips, environment: environment() });
  for (const name of ["AGENTS.md", "CLAUDE.md"]) {
    const p = path.join(root, name);
    if (isFile(p)) {
      text += fill(project_instructions, { name, text: fs.readFileSync(p, "utf8").slice(0, 6000) });
      break;
    }
  }
  return text;
}
