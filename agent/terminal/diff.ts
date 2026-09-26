// Line diffs, for showing a file change before it is made (screen.ts colors them).

const CONTEXT = 2;   // unchanged lines around each change

/** Hunks of a unified diff ("@@" headers and " ", "-", "+" lines, no file headers), with CONTEXT lines of context. */
export function unifiedDiff(a: string[], b: string[]): string[] {
  // Edit script: the common start and end, and a longest common subsequence of the middle.
  let pre = 0, suf = 0;
  while (pre < a.length && pre < b.length && a[pre] === b[pre]) pre++;
  while (suf < a.length - pre && suf < b.length - pre && a[a.length - 1 - suf] === b[b.length - 1 - suf]) suf++;
  const am = a.slice(pre, a.length - suf), bm = b.slice(pre, b.length - suf);
  const pairs: [number, number][] = [];   // matching lines (i, j) of the middle
  if (am.length * bm.length <= 4_000_000) {   // otherwise: show the whole middle as replaced
    const w = bm.length + 1, L = new Uint32Array((am.length + 1) * w);
    for (let i = am.length - 1; i >= 0; i--)
      for (let j = bm.length - 1; j >= 0; j--)
        L[i * w + j] = am[i] === bm[j] ? L[(i + 1) * w + j + 1] + 1 : Math.max(L[(i + 1) * w + j], L[i * w + j + 1]);
    for (let i = 0, j = 0; i < am.length && j < bm.length;) {
      if (am[i] === bm[j]) pairs.push([i++, j++]);
      else if (L[(i + 1) * w + j] >= L[i * w + j + 1]) i++;
      else j++;
    }
  }
  const rows: [" " | "-" | "+", string, number, number][] = [];   // [tag, line, line in a, line in b]
  let i = 0, j = 0;
  const same = (n: number) => { for (let k = 0; k < n; k++, i++, j++) rows.push([" ", a[i], i, j]); };
  const change = (i2: number, j2: number) => {
    for (; i < i2; i++) rows.push(["-", a[i], i, j]);
    for (; j < j2; j++) rows.push(["+", b[j], i, j]);
  };
  same(pre);
  for (const [pi, pj] of pairs) {
    change(pre + pi, pre + pj);
    same(1);
  }
  change(a.length - suf, b.length - suf);
  same(suf);

  const range = (start: number, n: number) => n === 1 ? `${start + 1}` : n === 0 ? `${start},0` : `${start + 1},${n}`;
  const changed = rows.flatMap((r, k) => (r[0] === " " ? [] : [k]));
  const out: string[] = [];
  for (let k = 0; k < changed.length;) {
    let last = k;
    while (last + 1 < changed.length && changed[last + 1] - changed[last] <= 2 * CONTEXT + 1) last++;
    const hunk = rows.slice(Math.max(0, changed[k] - CONTEXT), changed[last] + CONTEXT + 1);
    const oldLen = hunk.filter(r => r[0] !== "+").length, newLen = hunk.filter(r => r[0] !== "-").length;
    out.push(`@@ -${range(hunk[0][2], oldLen)} +${range(hunk[0][3], newLen)} @@`, ...hunk.map(r => r[0] + r[1]));
    k = last + 1;
  }
  return out;
}
