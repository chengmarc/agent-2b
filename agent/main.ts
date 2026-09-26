// The agent command (what `2b` runs): the ▶ prompt and its /commands;
// anything else typed there is a request for the Agent.
// Node runs these .ts files as they are (no build step, no npm packages), which only works for type syntax
// Node can strip: no enums, namespaces, or constructor parameter properties.
import { Agent, EFFORTS } from "./agent.ts";
import { ask, isAbort } from "./terminal/input.ts";
import { waitForServer } from "./loading.ts";
import { useProxy } from "./proxy.ts";
import { CTX, serverReady, startServer } from "./server/server.ts";
import { watchServer } from "./server/stopper.ts";
import { banner } from "./terminal/banner.ts";
import { BOLD, DIM, GOLD, GRN, RED, RST } from "./terminal/theme.ts";
import { fill } from "./text.ts";

const HELP = `/clear          start a new conversation
/effort LEVEL   reasoning effort: {efforts} (currently {effort})
/tokens         context used so far
/prompt         show the exact text the model reads (the conversation so far, as rendered)
/exit           quit
At a permission question, a (always) approves everything for the rest of the session{auto}.`;

async function main(): Promise<number> {
  if (process.argv.length > 2) {
    console.error("2b takes no options (in the agent, /help lists its commands)");
    return 1;
  }
  if (!(await serverReady())) {   // or use the one already running, e.g. for another 2B window
    const problem = startServer();
    if (problem) {
      console.error(`2b: ${problem}`);
      return 1;
    }
  }
  watchServer();
  useProxy();   // for WebSearch / WebFetch, and the commands the agent runs
  let agent = new Agent();
  console.log(banner(agent.root) + "\n");
  const loaded = await waitForServer();   // the loading screen, when the server has just been started
  if (loaded === null) return 1;
  let facts = `${Math.round(CTX / 1024)}k context`;
  try {
    facts += ` · system prompt ${(await agent.renderedTokens()).toLocaleString("en")} tokens`;
  } catch {}
  console.log(`${GRN}✓${RST} Model ${loaded ? `loaded in ${Math.round(loaded)}s` : "ready"}  ${DIM}${facts}${RST}`);
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
