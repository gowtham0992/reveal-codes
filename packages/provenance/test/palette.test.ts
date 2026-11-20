import { describe, expect, it } from "vitest";
import { colourSequence, nearest256, onBody, PANE, parseHex, RESET } from "../src/core/palette.js";
/** Independent brute force over the cube and the greys, for the expected indexes. */
function expected(hex: string): number {
  const [r, g, b] = parseHex(hex);
  const levels = [0, 95, 135, 175, 215, 255];
  let best = { index: -1, d: Number.POSITIVE_INFINITY };
  const consider = (index: number, cr: number, cg: number, cb: number): void => {
    const d = (r - cr) ** 2 + (g - cg) ** 2 + (b - cb) ** 2;
    if (d < best.d) best = { index, d };
  };
  for (let i = 0; i < 216; i += 1) {
    consider(
      16 + i,
      levels[Math.floor(i / 36)] ?? 0,
      levels[Math.floor(i / 6) % 6] ?? 0,
      levels[i % 6] ?? 0,
    );
  }
  for (let i = 0; i < 24; i += 1) consider(232 + i, 8 + 10 * i, 8 + 10 * i, 8 + 10 * i);
  return best.index;
}
describe("palette (Req 9.5, 9.6)", () => {
  it("maps the pane body to the cube entry 17 (0, 0, 95)", () => {
    expect(nearest256("#0F2766")).toBe(17);
  });
  it("maps the pale text colour to the grey 255 (238, 238, 238)", () => {
    expect(nearest256("#E8ECF6")).toBe(255);
  });
  it("maps every pane hex to the nearest cube or grey entry", () => {
    const hexes = [PANE.body, PANE.text, PANE.title, PANE.legend, ...Object.values(PANE.origin)];
    for (const hex of hexes) expect(nearest256(hex)).toBe(expected(hex));
    expect(nearest256("#FFFFFF")).toBe(231);
  });
  it("writes 24-bit and 256-colour sequences", () => {
    expect(colourSequence("#F5D98B", "fg", "truecolor")).toBe("\u001b[38;2;245;217;139m");
    expect(colourSequence("#0F2766", "bg", "ansi256")).toBe("\u001b[48;5;17m");
    expect(onBody("#A6D4F7", "truecolor")).toBe("\u001b[38;2;166;212;247m\u001b[48;2;15;39;102m");
    expect(RESET).toBe("\u001b[0m");
  });
});
