// Reading tool arguments the model sends loosely (numbers as strings, 0 for "not given").

/** A whole number from a tool argument; missing, empty or 0 means the default. */
export function int(v: unknown, dflt: number): number {
  if (v === undefined || v === null || v === "" || v === 0) return dflt;
  const n = Number(v);
  if (!Number.isFinite(n)) throw new TypeError(`not a number: ${JSON.stringify(v)}`);
  return Math.trunc(n);
}
