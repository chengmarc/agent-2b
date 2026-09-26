// One conversation with the local model (llama-server, OpenAI chat API): the model calls, running the tools
// the model asks for, and trimming old tool results near the context limit. What the model reads is in prompt/.
// Each tool is one module in tools/; anything that changes, runs or fetches something asks first.
import type { IncomingMessage } from "node:http";
import * as os from "node:os";
import * as path from "node:path";
import { ask, beginRequest, endRequest, isAbort } from "./input.ts";
import * as prompt from "./prompt/index.ts";
import { ALIAS, CTX, post, readAll, SERVER } from "./server.ts";
import { SCREEN } from "./terminal.ts";
import { DIM, RED, RST, YEL } from "./theme.ts";
import { TOOLS, type Schema, type Session, type Tool } from "./tools/index.ts";
import { fill, splitLines } from "./text.ts";

export const EFFORTS = ["low", "medium", "high"];   // reasoning effort levels
const MAX_RESULT = 12000;   // chars kept from one tool result
const MAX_STEPS = 60;       // model calls per request

let M: Record<string, string> = {};   // messages.toml

class ServerError extends Error {}   // the model server couldn't answer: the request is dropped, the conversation goes on

type Call = { id: string; type: "function"; function: { name: string; arguments: string } };
type Message = { role: string; content: string; reasoning_content?: string; tool_calls?: Call[]; tool_call_id?: string };

/** Why args don't fit the tool's parameters, or null if they do. */
function checkArgs(schema: Schema, args: unknown): string | null {
  if (typeof args !== "object" || args === null || Array.isArray(args)) return "arguments must be a JSON object";
  const extra = Object.keys(args).find(k => !(k in schema.parameters.properties));
  if (extra) return `unexpected argument '${extra}'`;
  const missing = schema.parameters.required.find(k => !(k in args));
  return missing ? `missing required argument '${missing}'` : null;
}

export class Agent implements Session {
  root = process.cwd();
  used = 0;
  signal = new AbortController().signal;   // the current request's; see turn()
  tools = new Map(TOOLS.map(t => [t.SCHEMA.name, t] as [string, Tool]));
  auto: boolean;
  effort: string;
  messages: Message[];
  identity: string;

  constructor(auto = false, effort = "medium") {
    M = prompt.messages();
    this.auto = auto;
    this.effort = effort;
    this.messages = [{ role: "system", content: prompt.instructions(this.root, M.project_instructions) }];
    this.identity = prompt.identity();
  }

  // ---------- model ----------
  body() {
    return { model: ALIAS, messages: this.messages,
             tools: TOOLS.map(t => ({ type: "function", function: t.SCHEMA })),
             chat_template_kwargs: { reasoning_effort: this.effort, model_identity: this.identity } };
  }

  /** The exact text the model reads for the conversation so far (the server applies the chat template). */
  async rendered(): Promise<string> {
    return JSON.parse(await readAll(await post("/apply-template", this.body(), undefined, 60_000))).prompt;
  }

  /** How many tokens that text is, by the model's own tokenizer. */
  async renderedTokens(): Promise<number> {
    const body = { content: await this.rendered(), add_special: false, parse_special: true };
    return JSON.parse(await readAll(await post("/tokenize", body, undefined, 60_000))).tokens.length;
  }

  async chat(): Promise<[string, string, Call[]]> {
    let res: IncomingMessage;
    SCREEN.wait();   // until the first thing to show
    try {
      res = await post("/v1/chat/completions", { ...this.body(), stream: true, stream_options: { include_usage: true } },
                       this.signal, 1_800_000);
    } catch (e) {
      if (isAbort(e)) throw e;
      throw new ServerError(`can't reach ${SERVER} (${(e as Error).message}). Is the server running?`);
    }
    if (res.statusCode !== 200) throw new ServerError(`server error ${res.statusCode}: ${(await readAll(res)).slice(0, 500)}`);
    let content = "", reasoning = "", buffer = "";
    const calls = new Map<number, { id: string; name: string; args: string }>();
    const event = (line: string) => {
      line = line.trim();
      if (!line.startsWith("data:") || line === "data: [DONE]") return;
      const ev = JSON.parse(line.slice(5));
      if (ev.usage) this.used = (ev.usage.prompt_tokens ?? 0) + (ev.usage.completion_tokens ?? 0);
      for (const ch of ev.choices ?? []) {
        const d = ch.delta ?? {};
        if (d.reasoning_content) {
          reasoning += d.reasoning_content;
          SCREEN.stream("think", d.reasoning_content);
        }
        if (d.content) {
          content += d.content;
          SCREEN.stream("say", d.content);
        }
        for (const tc of d.tool_calls ?? []) {
          const i = tc.index ?? 0;
          if (!calls.has(i)) calls.set(i, { id: "", name: "", args: "" });
          const slot = calls.get(i)!;
          slot.id = tc.id || slot.id;
          slot.name += tc.function?.name ?? "";
          slot.args += tc.function?.arguments ?? "";
        }
      }
    };
    res.setEncoding("utf8");
    for await (const chunk of res) {
      const lines = (buffer + chunk).split("\n");
      buffer = lines.pop()!;
      lines.forEach(event);
    }
    event(buffer);
    const ordered = [...calls.keys()].sort((a, b) => a - b).map(k => calls.get(k)!);
    return [content, reasoning, ordered.map((c, i) => ({ id: c.id || `call_${i}`, type: "function",
                                                          function: { name: c.name, arguments: c.args || "{}" } }))];
  }

  // ---------- what tools get from the session ----------
  path(p: string): string {
    if (p === "~" || p.startsWith("~/") || p.startsWith("~\\")) p = os.homedir() + p.slice(1);
    return path.resolve(this.root, p);
  }

  /** Path as shown to the model: relative to the project root when inside it, with / separators. */
  rel(p: string): string {
    const r = path.relative(this.root, p);
    return (r && !r.startsWith("..") && !path.isAbsolute(r) ? r : p).replaceAll("\\", "/");
  }

  async confirm(what: string): Promise<string | null> {
    if (this.auto) return null;
    const answer = await ask(`    ${YEL}Allow ${what}? [y]es / [n]o / [a]lways: ${RST}`);
    const ans = (answer ?? "n").trim().toLowerCase();   // end of input denies
    if (ans === "a" || ans === "always") {
      this.auto = true;
      return null;
    }
    if (ans === "y" || ans === "yes" || ans === "") return null;
    const why = answer === null ? "" : ((await ask(`    ${YEL}Tell the agent why (optional): ${RST}`)) ?? "").trim();
    return M.denied + (why ? fill(M.denied_reason, { reason: why }) : "");
  }

  // ---------- tools ----------
  async runTool(name: string, rawArgs: string): Promise<string> {
    let args: unknown;
    try {
      args = JSON.parse(rawArgs || "{}");
    } catch {
      return fill(M.bad_json, { raw: rawArgs.slice(0, 200) });
    }
    const a = (typeof args === "object" && args ? args : {}) as Record<string, unknown>;
    let shown = String(a.command || a.args || a.query || a.url || a.pattern || a.path || "");
    if (a.pattern && a.path) shown += `  in ${a.path}`;
    if (a.glob) shown += `  (${a.glob})`;
    SCREEN.tool(name, shown);
    const tool = this.tools.get(name);
    if (!tool) return fill(M.unknown_tool, { name, available: [...this.tools.keys()].join(", ") });
    let result: string;
    const bad = checkArgs(tool.SCHEMA, args);
    if (bad) {
      result = fill(M.bad_arguments, { name, error: bad });
    } else {
      try {
        result = await tool.run(this, args);
      } catch (e) {
        if (isAbort(e)) throw e;
        const err = e as NodeJS.ErrnoException;
        result = fill(M.tool_exception, { kind: err.code || err.name || "Error", error: err.message ?? String(e) });
      }
    }
    if (result.length > MAX_RESULT) {
      result = result.slice(0, MAX_RESULT / 2) + fill(M.result_cut, { cut: result.length - MAX_RESULT }) +
               result.slice(-MAX_RESULT / 2);
    }
    if (!tool.QUIET || result.startsWith("Error")) {
      const text = result.length < 600 ? result : result.slice(0, 600) + " ...";
      const lines = splitLines(text);
      SCREEN.detail((lines.length ? lines : [""]).map(l => [DIM, l] as [string, string]));
    }
    return result;
  }

  // ---------- loop ----------
  /** Near the context limit, blank out the oldest tool results (keeps the last 4). */
  compact() {
    if (this.used < CTX * 0.7) return;
    const old = this.messages.filter(m => m.role === "tool" && m.content !== M.elided).slice(0, -4);
    for (const m of old) m.content = M.elided;
    SCREEN.note(`(context ${this.used}/${CTX} tokens: elided ${old.length} old tool results)`);
  }

  async turn(userText: string) {
    const snapshot = this.messages.length;
    this.messages.push({ role: "user", content: userText });
    this.signal = beginRequest();
    try {
      for (let step = 0; step < MAX_STEPS; step++) {
        const [content, reasoning, calls] = await this.chat();
        const msg: Message = { role: "assistant", content };
        if (reasoning) msg.reasoning_content = reasoning;
        if (calls.length) msg.tool_calls = calls;
        this.messages.push(msg);
        if (!calls.length) return;
        for (const tc of calls) {
          this.signal.throwIfAborted();
          const result = await this.runTool(tc.function.name, tc.function.arguments);
          this.messages.push({ role: "tool", tool_call_id: tc.id, content: result });
        }
        this.compact();
      }
      SCREEN.note(`(stopped after ${MAX_STEPS} steps)`, YEL);
    } catch (e) {
      if (!isAbort(e) && !(e instanceof ServerError)) throw e;
      this.messages.splice(snapshot);
      if (isAbort(e)) SCREEN.note("(interrupted; this request was dropped from the conversation)", YEL);
      else SCREEN.note((e as Error).message, RED);
    } finally {
      endRequest();
      SCREEN.end();
    }
  }
}
