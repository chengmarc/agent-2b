/** Fill {name} placeholders (in instructions.md, messages.toml and the tools' MESSAGES). */
export function fill(template: string, values: Record<string, unknown>): string {
  return template.replace(/\{(\w+)\}/g, (m, k: string) => (k in values ? String(values[k]) : m));
}

/** Lines without their line endings, like Python's str.splitlines(). */
export function splitLines(text: string): string[] {
  if (!text) return [];
  const lines = text.split(/\r\n|[\n\r\v\f\x1c-\x1e\x85\p{Zl}\p{Zp}]/u);
  if (lines[lines.length - 1] === "") lines.pop();
  return lines;
}
