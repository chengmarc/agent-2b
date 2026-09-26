// GitHub: run the gh CLI; commands that only read run freely, the rest ask first.
import type { Session } from "./_types.ts";
import { runCommand, shlexSplit } from "./_commands.ts";

export const SCHEMA = {
  name: "GitHub",
  description: "Run the GitHub CLI (gh) with these arguments, e.g. `pr list`, `issue view 12`, `pr diff 34`, `run list`.",
  parameters: { type: "object", properties: {
    args: { type: "string", description: "everything after `gh`" },
  }, required: ["args"] },
};
export const TIP = "pull requests, issues and CI runs of this repository.";

// "command subcommand", or a command whose subcommands all only read
const READ = new Set(["pr list", "pr view", "pr diff", "pr checks", "pr status", "issue list", "issue view", "issue status",
                      "repo view", "repo list", "run list", "run view", "release list", "release view", "workflow list",
                      "search", "status"]);
const BODY_FLAGS = new Set(["-X", "--method", "-f", "-F", "--field", "--raw-field", "--input"]);

export function readsOnly(argv: string[]): boolean {
  if (!argv.length) return false;
  if (argv[0] === "api") {   // GET only: no method override, no body fields
    return !argv.slice(1).some(a => BODY_FLAGS.has(a.split("=")[0]) || /^-[XfF]/.test(a));
  }
  return !argv.includes("--web") && (READ.has(argv[0]) || READ.has(argv.slice(0, 2).join(" ")));
}

export async function run(ag: Session, args: { args: string }): Promise<string> {
  let argv = shlexSplit(args.args);
  if (argv[0] === "gh") argv = argv.slice(1);   // the model sometimes repeats the program name
  return runCommand(ag, ["gh", ...argv], !readsOnly(argv));
}
