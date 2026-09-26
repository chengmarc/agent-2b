// Generates the README badges, media/badge-<name>-light.svg and -dark.svg, in the stats strip's style.
// Add a badge to BADGES and run from the repo root: runtime/node/node.exe media/badges.ts

import { writeFileSync } from 'node:fs';

type Badge = { name: string; icon: string; label: string; value: string };

// Icons are paths drawn in a 24x24 box.
const BADGES: Badge[] = [
  {
    name: 'windows',
    icon: 'M0 0h11.4v11.4H0zM12.6 0H24v11.4H12.6zM0 12.6h11.4V24H0zM12.6 12.6H24V24H12.6z',
    label: 'Windows',
    value: '10 · 11',
  },
  {
    name: 'nvidia',
    // Simple Icons (CC0)
    icon: 'M8.948 8.798v-1.43a6.7 6.7 0 0 1 .424-.018c3.922-.124 6.493 3.374 6.493 3.374s-2.774 3.851-5.75 3.851c-.398 0-.787-.062-1.158-.185v-4.346c1.528.185 1.837.857 2.747 2.385l2.04-1.714s-1.492-1.952-4-1.952a6.016 6.016 0 0 0-.796.035m0-4.735v2.138l.424-.027c5.45-.185 9.01 4.47 9.01 4.47s-4.08 4.964-8.33 4.964c-.37 0-.733-.035-1.095-.097v1.325c.3.035.61.062.91.062 3.957 0 6.82-2.023 9.593-4.408.459.371 2.34 1.263 2.73 1.652-2.633 2.208-8.772 3.984-12.253 3.984-.335 0-.653-.018-.971-.053v1.864H24V4.063zm0 10.326v1.131c-3.657-.654-4.673-4.46-4.673-4.46s1.758-1.944 4.673-2.262v1.237H8.94c-1.528-.186-2.73 1.245-2.73 1.245s.68 2.412 2.739 3.11M2.456 10.9s2.164-3.197 6.5-3.533V6.201C4.153 6.59 0 10.653 0 10.653s2.35 6.802 8.948 7.42v-1.237c-4.84-.6-6.492-5.936-6.492-5.936z',
    label: 'NVIDIA GPU',
    value: 'RTX 5060+',
  },
];

// The stats strip's colors: the brand gradient, then text and lines per theme.
const BRAND = ['#c88214', '#dc4b78', '#9664d7'];
const THEMES = {
  light: { bg: '#fbf8f3', line: '#e2d8c8', strong: '#3d342b', muted: '#6b5f52' },
  dark: { bg: '#1c1814', line: '#3a322a', strong: '#efe6da', muted: '#b5a898' },
};

const FONT = `-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans', Helvetica, Arial, sans-serif`;
const H = 30, SIZE = 13, ICON = 16, PAD = 11, GAP = 8;

// Helvetica advance widths per 1000 em. The text is also given textLength, so a font that runs wider or narrower
// is fitted to the same box instead of overflowing it.
const WIDTHS: Record<string, number> = {
  ' ': 278, '·': 278, '+': 584, '.': 278, '-': 333,
  '0': 556, '1': 556, '2': 556, '3': 556, '4': 556, '5': 556, '6': 556, '7': 556, '8': 556, '9': 556,
  A: 667, B: 667, C: 722, D: 722, E: 667, F: 611, G: 778, H: 722, I: 278, J: 500, K: 667, L: 556, M: 833,
  N: 722, O: 778, P: 667, Q: 778, R: 722, S: 667, T: 611, U: 722, V: 667, W: 944, X: 667, Y: 667, Z: 611,
  a: 556, b: 556, c: 500, d: 556, e: 556, f: 278, g: 556, h: 556, i: 222, j: 222, k: 500, l: 222, m: 833,
  n: 556, o: 556, p: 556, q: 556, r: 333, s: 500, t: 278, u: 556, v: 500, w: 722, x: 500, y: 500, z: 500,
};
const BOLD = 1.06; // bold runs about this much wider

function width(text: string, bold = false): number {
  const em = [...text].reduce((sum, ch) => sum + (WIDTHS[ch] ?? 600), 0) / 1000;
  return Math.round(em * SIZE * (bold ? BOLD : 1) * 10) / 10;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

function render(b: Badge, t: (typeof THEMES)['light']): string {
  const lw = width(b.label, true), vw = width(b.value);
  const labelX = PAD + ICON + GAP;
  const divX = labelX + lw + PAD;
  const valueX = divX + PAD;
  const W = Math.ceil(valueX + vw + PAD);
  const y = H / 2 + SIZE * 0.35;
  const iy = (H - ICON) / 2;
  const alt = `${b.label} ${b.value}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(alt)}">
<title>${esc(alt)}</title>
<defs><linearGradient id="brand" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="24" y2="0"><stop offset="0" stop-color="${BRAND[0]}"/><stop offset=".5" stop-color="${BRAND[1]}"/><stop offset="1" stop-color="${BRAND[2]}"/></linearGradient></defs>
<rect x=".5" y=".5" width="${W - 1}" height="${H - 1}" rx="8" fill="${t.bg}" stroke="${t.line}"/>
<path transform="translate(${PAD} ${iy}) scale(${ICON / 24})" fill="url(#brand)" d="${b.icon}"/>
<g font-family="${FONT}" font-size="${SIZE}">
<text x="${labelX}" y="${y}" font-weight="600" fill="${t.strong}" textLength="${lw}" lengthAdjust="spacing">${esc(b.label)}</text>
<text x="${valueX}" y="${y}" fill="${t.muted}" textLength="${vw}" lengthAdjust="spacing">${esc(b.value)}</text>
</g>
<line x1="${divX}" y1="8" x2="${divX}" y2="${H - 8}" stroke="${t.line}"/>
</svg>
`;
}

const dir = new URL('.', import.meta.url);
for (const b of BADGES) {
  for (const [theme, colors] of Object.entries(THEMES)) {
    writeFileSync(new URL(`badge-${b.name}-${theme}.svg`, dir), render(b, colors));
  }
}
console.log(`wrote ${BADGES.length * 2} badges`);
