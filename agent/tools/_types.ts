// What a tool is, and what it gets from the agent: the tools import these, index.ts lists the tools.

export interface Schema {
  name: string;
  description: string;
  parameters: { type: string; properties: Record<string, object>; required: string[] };
}

export interface Tool {
  SCHEMA: Schema;
  TIP: string;
  QUIET?: boolean;
  run(ag: Session, args: any): Promise<string>;
}

/** What a tool gets from the agent. */
export interface Session {
  root: string;
  signal: AbortSignal;   // aborted when the user interrupts the request
  path(p: string): string;
  rel(p: string): string;
  confirm(what: string): Promise<string | null>;   // null = allowed, otherwise the denial to return
}
