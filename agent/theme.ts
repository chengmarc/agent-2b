// The agent's colors, made for the app's warm near-white background (mintty.conf):
// light and bright, yet every step of the gradient keeps a contrast of about 3 or more on it.
export const DIM = "\x1b[2m", BOLD = "\x1b[1m", ITALIC = "\x1b[3m", RST = "\x1b[0m";
export const YEL = "\x1b[33m", RED = "\x1b[31m", GRN = "\x1b[32m";   // mintty.conf darkens these three
const GRADIENT = [[200, 130, 20], [220, 75, 120], [150, 100, 215]];   // amber -> rose -> violet

/** Color at position t (0..1) along GRADIENT, as a 24-bit ANSI foreground code. */
export function shade(t: number): string {
  const seg = Math.min(Math.trunc(t * (GRADIENT.length - 1)), GRADIENT.length - 2);
  const u = t * (GRADIENT.length - 1) - seg;
  const [r, g, b] = GRADIENT[seg].map((a, i) => Math.round(a + (GRADIENT[seg + 1][i] - a) * u));
  return `\x1b[38;2;${r};${g};${b}m`;
}

export const GOLD = shade(0), ROSE = shade(0.5), VIOLET = shade(1);
