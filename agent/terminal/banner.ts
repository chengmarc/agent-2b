// The banner at the top of a session: the art (Braille, one string per row) in the gradient, and the title line.
import { BOLD, GOLD, ROSE, RST, shade, VIOLET } from "./theme.ts";

const LOGO = `
⠀⠀⠀⠈⢶⣄⠀⠀⠀⠀⠀⠀⢀⣀⣀⣀⣀⣀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠈⠛⠟⣒⣒⠒⠛⢓⣲⣶⣿⣿⣭⣭⣭⣙⡓⠲⣄⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⢀⡴⣫⠔⠋⠰⠿⠛⠟⠋⠁⠈⠙⢯⠛⣿⣷⣭⡉⠲⢦⣄⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⣴⡿⠋⠁⠀⠀⣤⠀⠀⠀⠀⠀⠀⠀⢸⡏⠉⢻⣿⣷⡄⠀⠙⢷⡀⠀⠀⠀⠀
⠀⠀⠀⢀⡾⠋⠀⠀⠀⠀⢰⡇⡌⠀⠀⠀⠀⠀⠀⠼⠁⠀⠀⠹⣿⣿⠀⠀⠈⢿⡄⠀⠀⠀
⠀⠀⢠⡞⠀⠀⠀⠀⡴⠃⢸⡟⡇⠀⠀⠀⢰⡄⠀⠀⠀⠀⠀⠀⢿⢿⡇⠀⠀⠀⢻⡀⠀⠀
⠀⠀⡼⠀⠀⠀⠀⡼⠁⣴⣿⣧⠃⠀⠀⠀⢸⡧⠀⠀⠀⠀⠀⠀⡜⢸⣏⠀⠀⠀⠈⣇⠀⠀
⠀⢀⠃⠀⠀⠀⢠⢃⣼⣿⣿⣿⡄⠀⠀⠀⠘⣷⠀⣦⠀⠀⠀⠀⠀⢸⠇⡼⠀⠀⠀⡿⡀⠀
⠀⢸⠀⠀⠀⠀⠹⣼⣿⣿⣿⣿⣿⣤⠀⠀⠀⢻⣧⢸⡆⠀⠀⠀⢠⣟⡞⠁⠀⠀⠀⠃⢧⠀
⠀⣸⠀⠀⠀⠀⠰⣿⣿⣿⣿⡿⠿⠿⣦⡄⠀⠈⣿⣿⠆⠀⠀⣠⡿⠋⠀⠀⠀⠀⠀⠀⠘⡄
⢀⡇⢠⡀⠀⠀⢸⣿⠟⠋⠀⠀⠀⠀⠀⠙⠲⠤⣸⠿⢇⠀⠈⠁⠀⠀⠀⠀⠀⠀⠀⣦⠀⢇
⢸⠀⡞⡇⠀⠀⠈⣿⣄⠀⠀⠠⣀⣀⡀⠀⠀⠀⠈⠲⣼⠃⠀⠀⠀⠀⠀⠀⠀⢠⢀⡟⡀⡜
⠘⡆⡇⢳⡀⠀⠀⡘⠿⣦⠀⠀⠀⠀⠀⠄⠀⠀⠀⣼⡇⢀⣴⠃⠀⠀⠀⠀⢠⣯⠞⢰⣡⠃
⠀⠘⠣⠄⠛⢦⡀⢿⢳⡌⠻⠒⠖⠲⣶⠖⠋⢁⣼⣧⣿⣏⠁⠀⣠⣄⢀⣰⠛⠁⠰⠟⠁⠀
⠀⠀⠀⠀⠀⠀⠉⠘⠣⠙⢦⣀⣀⠀⢹⣷⣾⣿⣿⣿⣿⣿⣖⠋⠽⠕⠊⠀⠀⠀⠀⠀⠀⠀
`.split("\n").slice(1, -1);

export function banner(root: string): string {
  const w = Math.max(...LOGO.map(l => l.length)) - 1;
  const logo = LOGO.map(l => BOLD + [...l].map((ch, i) => shade(i / w) + ch).join("") + RST).join("\n");
  return `\n${logo}\n\n${BOLD}${GOLD}Agent 2B${RST} · ${ROSE}Local Agent${RST} · ${VIOLET}${root}${RST}`;
}
