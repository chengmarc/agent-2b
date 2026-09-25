// The agent command (what `salieri` runs): the ▶ prompt and its /commands;
// anything else typed there is a request for the Agent.
// Node runs these .ts files as they are (no build step, no npm packages), which only works for type syntax
// Node can strip: no enums, namespaces, or constructor parameter properties.
import { Agent, CTX, EFFORTS } from "./agent.ts";
import { ask, banner, BOLD, DIM, GOLD, isAbort, RED, RST } from "./terminal.ts";
import { fill } from "./text.ts";

const HELP = `/clear          start a new conversation
/effort LEVEL   reasoning effort: {efforts} (currently {effort})
/tokens         context used so far
/prompt         show the exact text the model reads (the conversation so far, as rendered)
/exit           quit
At a permission question, a (always) approves everything for the rest of the session{auto}.`;

async function main(): Promise<number> {
  let agent = new Agent();
  try {   // continues the launcher's Expert on CPU / Context length lines, in the same columns
    console.log(`${"System prompt:".padEnd(16)}${await agent.renderedTokens()} tokens`);
  } catch {}   // no server yet: the first request reports that
  console.log(banner(agent.root));
  console.log(`${DIM}/help for commands · Ctrl+C interrupts${RST}`);
  while (true) {
    let line: string | null;
    process.stdout.write("\n");
    try {
      line = await ask(`${GOLD}${BOLD}▶${RST} `);
    } catch (e) {
      if (isAbort(e)) return 0;
      throw e;
    }
    if (line === null) {
      console.log();
      return 0;
    }
    const text = line.trim();
    if (!text) continue;
    if (text === "/exit" || text === "/quit") return 0;
    if (text === "/help") {
      console.log(fill(HELP, { effort: agent.effort, efforts: EFFORTS.join(" | "), auto: agent.auto ? " (on now)" : "" }));
    } else if (text === "/clear") {
      agent = new Agent(agent.auto, agent.effort);
      console.log("(new conversation)");
    } else if (text.startsWith("/effort")) {
      const level = text.split(/\s+/).pop()!;
      if (EFFORTS.includes(level)) agent.effort = level;
      console.log(`effort: ${agent.effort}`);
    } else if (text === "/tokens") {
      console.log(`${agent.used} / ${CTX} tokens`);
    } else if (text === "/prompt") {
      try {
        console.log(`${DIM}${await agent.rendered()}${RST}`);
      } catch (e) {
        console.log(`${RED}can't render: ${(e as Error).message}${RST}`);
      }
    } else if (/^\/\w+$/.test(text)) {   // a mistyped command, not a message for the model
      console.log(`unknown command ${text} (/help lists them)`);
    } else {
      await agent.turn(text);
    }
  }
}

process.exit(await main());
