// The agent's tools, one module each. A tool module exports:
//   SCHEMA    name, description and parameters, as sent to the model
//   TIP       its line in the tool tips of instructions.md
//   MESSAGES  optional: its own texts to the model ({placeholders} are filled in by run)
//   run(ag, args) -> Promise<string>   ag is the Session in _types.ts; args are checked against SCHEMA first
//   QUIET     optional: true if the result isn't echoed on screen (the tool showed a diff instead)
// To add a tool, write its module and list it in TOOLS.
import * as read from "./read.ts";
import * as edit from "./edit.ts";
import * as write from "./write.ts";
import * as glob from "./glob.ts";
import * as grep from "./grep.ts";
import * as bash from "./bash.ts";
import * as powershell from "./powershell.ts";
import * as webSearch from "./web_search.ts";
import * as webFetch from "./web_fetch.ts";
import * as git from "./git.ts";
import * as github from "./github.ts";
import type { Tool } from "./_types.ts";

export type { Schema, Session, Tool } from "./_types.ts";

export const TOOLS: Tool[] = [read, edit, write, glob, grep, bash, powershell, webSearch, webFetch, git, github];   // order the model sees
