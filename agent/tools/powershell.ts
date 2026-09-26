// PowerShell: run a Windows PowerShell 5.1 command, after asking.
import type { Session } from "./index.ts";
import { runCommand } from "./_commands.ts";

export const SCHEMA = {
  name: "PowerShell",
  description: "Run a Windows PowerShell 5.1 command in the project root; returns stdout+stderr and exit code.",
  parameters: { type: "object", properties: {
    command: { type: "string" },
  }, required: ["command"] },
};
export const TIP = "only for Windows-specific tasks (processes, services, registry). Same rules as Bash.";

export async function run(ag: Session, args: { command: string }): Promise<string> {
  // PowerShell 5.1 writes in the console code page (e.g. GBK); switch it to UTF-8 for this command.
  return runCommand(ag, ["powershell.exe", "-NoProfile", "-NonInteractive", "-Command",
                         "[Console]::OutputEncoding = [Text.Encoding]::UTF8; " + args.command]);
}
