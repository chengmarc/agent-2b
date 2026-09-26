// Git: run git; commands that only read run freely, the rest ask first.
import type { Session } from "./_types.ts";
import { runCommand, shlexSplit } from "./_commands.ts";

export const SCHEMA = {
  name: "Git",
  description: "Run git in the project root with these arguments, e.g. `status`, `diff HEAD~1`, `log --oneline -10`.",
  parameters: { type: "object", properties: {
    args: { type: "string", description: "everything after `git`" },
  }, required: ["args"] },
};
export const TIP = "see what changed and why (status, diff, log, show, blame). Don't commit, push, or change branches unless the user asks.";

const READ = new Set(["status", "diff", "log", "show", "blame", "ls-files", "rev-parse", "grep", "shortlog", "describe",
                      "reflog", "ls-tree", "cat-file", "whatchanged"]);
const CHANGING_FLAGS = new Set(["-d", "-D", "-m", "-M", "-c", "-C", "--delete", "-f", "--force"]);

export function readsOnly(argv: string[]): boolean {
  if (!argv.length || argv[0].startsWith("-") || argv.some(a => a.startsWith("--output"))) return false;
  const [sub, ...rest] = argv;
  if (READ.has(sub)) return true;
  if (sub === "branch" || sub === "tag" || sub === "remote") {   // listing only: no names, only flags like -a -v -l
    return rest.every(a => a.startsWith("-") && !CHANGING_FLAGS.has(a));
  }
  return sub === "stash" && rest[0] === "list";
}

export async function run(ag: Session, args: { args: string }): Promise<string> {
  let argv = shlexSplit(args.args);
  if (argv[0] === "git") argv = argv.slice(1);   // the model sometimes repeats the program name
  return runCommand(ag, ["git", ...argv], !readsOnly(argv));
}
