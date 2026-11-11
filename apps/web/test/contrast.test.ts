import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseCss, type CssDeclaration } from "./support/css";
import { WEB_ROOT, readSources } from "./support/scan";
import { parseTokenSheet } from "./static/css-colours";

/** Requirements 11.1, 11.2, 11.3, 11.4, 11.5, 7.8, 7.10: the contrast record, recomputed from the stylesheets. */

type Pair = {
  readonly fg: string;
  readonly bg: string;
  /** The ratio recorded in the design, two decimals. */
  readonly ratio: string;
  readonly threshold: 4.5 | 7;
};

/** The design's "Contrast record" table. A name starting with `--` is a Token; anything else is a Pane hex. */
const PAIRS: readonly Pair[] = [
  { fg: "--ink", bg: "--paper", ratio: "17.27", threshold: 4.5 },
  { fg: "--ink", bg: "--panel", ratio: "16.55", threshold: 4.5 },
  { fg: "--ink", bg: "--desk", ratio: "13.73", threshold: 4.5 },
  { fg: "--ink", bg: "--rule", ratio: "10.36", threshold: 4.5 },
  { fg: "--ink", bg: "--white", ratio: "17.55", threshold: 4.5 },
  { fg: "--ink", bg: "--disabled-fill", ratio: "14.90", threshold: 4.5 },
  { fg: "--muted", bg: "--paper", ratio: "7.02", threshold: 4.5 },
  { fg: "--muted", bg: "--panel", ratio: "6.73", threshold: 4.5 },
  { fg: "--muted", bg: "--disabled-fill", ratio: "6.06", threshold: 4.5 },
  { fg: "--oxblood", bg: "--paper", ratio: "11.49", threshold: 4.5 },
  { fg: "--oxblood", bg: "--panel", ratio: "11.01", threshold: 4.5 },
  { fg: "--white", bg: "--oxblood", ratio: "11.68", threshold: 4.5 },
  { fg: "--white", bg: "--ink", ratio: "17.55", threshold: 4.5 },
  { fg: "--fail", bg: "--paper", ratio: "7.70", threshold: 7 },
  { fg: "--white", bg: "--fail", ratio: "7.83", threshold: 7 },
  { fg: "#e8ecf6", bg: "#0f2766", ratio: "11.82", threshold: 4.5 },
  { fg: "#bac4e2", bg: "#0f2766", ratio: "8.04", threshold: 4.5 },
  { fg: "#f5d98b", bg: "#0f2766", ratio: "10.10", threshold: 4.5 },
  { fg: "#a6d4f7", bg: "#0f2766", ratio: "8.91", threshold: 4.5 },
  { fg: "#d7c6f5", bg: "#0f2766", ratio: "8.84", threshold: 4.5 },
  { fg: "#9adbb0", bg: "#0f2766", ratio: "8.74", threshold: 4.5 },
  { fg: "--white", bg: "#0f2766", ratio: "13.98", threshold: 4.5 },
  { fg: "#0f2766", bg: "#e8ecf6", ratio: "11.82", threshold: 4.5 },
  { fg: "#c9d2ec", bg: "#0a1c4f", ratio: "10.77", threshold: 4.5 },
  { fg: "--white", bg: "#0a1c4f", ratio: "16.26", threshold: 4.5 },
];

const RING = { fg: "--fail-ring", bg: "#0f2766", ratio: "6.16", threshold: 3 } as const;

const read = (path: string): string => readFileSync(join(WEB_ROOT, path), "utf8");
const tokens = parseTokenSheet(read("app/globals.css"));
const PANE_FILES = ["src/pane/pane.module.css", "src/pane/status-bar.module.css"] as const;

/** The six-digit hex of a Token name or Pane hex. */
function hexOf(name: string): string {
  const value = name.startsWith("--") ? tokens[name] : name;
  if (value === undefined || !/^#[0-9a-f]{6}$/i.test(value.trim()))
    throw new Error(`${name} does not resolve to a six-digit hex colour`);
  return value.trim().toLowerCase();
}

function channel(byte: number): number {
  const s = byte / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

/** WCAG 2.x relative luminance of a six-digit hex colour. */
function luminance(hex: string): number {
  const n = (i: number): number => channel(parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16));
  return 0.2126 * n(0) + 0.7152 * n(1) + 0.0722 * n(2);
}

/** WCAG contrast ratio of two six-digit hex colours. */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return ((hi ?? 0) + 0.05) / ((lo ?? 0) + 0.05);
}

const measure = (p: { fg: string; bg: string }): number => contrastRatio(hexOf(p.fg), hexOf(p.bg));
const label = (p: { fg: string; bg: string }): string => `${p.fg} on ${p.bg}`;

/** Name of a `color`/`background` value: `var(--x)` gives `--x`, a hex gives lowercase hex. */
function nameOf(value: string): string | null {
  const v = value.trim().toLowerCase();
  const m = /^var\(\s*(--[\w-]+)\s*\)$/.exec(v);
  if (m !== null) return m[1] ?? null;
  return /^#[0-9a-f]{6}$/.test(v) ? v : null;
}

function paneDeclarations(path: string): CssDeclaration[] {
  return parseCss(read(path)).declarations.filter((d) => d.atRules.length === 0);
}

describe("Contrast record _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5_", () => {
  it("the Token_Sheet holds a six-digit hex for every Token used in the table", () => {
    for (const p of PAIRS) {
      expect(() => hexOf(p.fg), label(p)).not.toThrow();
      expect(() => hexOf(p.bg), label(p)).not.toThrow();
    }
  });

  it("every text and code pair is at least 4.5:1 and every Failing_Code pair at least 7:1", () => {
    for (const p of PAIRS) {
      expect(measure(p), label(p)).toBeGreaterThanOrEqual(p.threshold);
    }
    const failing = PAIRS.filter((p) => p.bg === "--fail" || p.fg === "--fail");
    expect(failing.length).toBeGreaterThan(0);
    for (const p of failing) expect(p.threshold, label(p)).toBe(7);
    expect(measure({ fg: "--white", bg: "--fail" })).toBeGreaterThanOrEqual(7);
  });

  it("the ring #FF8A8A on #0F2766 is at least 3:1", () => {
    expect(hexOf("--fail-ring")).toBe("#ff8a8a");
    expect(measure(RING)).toBeGreaterThanOrEqual(RING.threshold);
  });

  it("measured values equal the design's table to two decimals", () => {
    const measured = [...PAIRS, RING].map((p) => `${label(p)} ${measure(p).toFixed(2)}`);
    const recorded = [...PAIRS, RING].map((p) => `${label(p)} ${p.ratio}`);
    expect(measured).toEqual(recorded);
  });

  it("every Pane colour in the table is declared in the Pane stylesheets", () => {
    const paneText = PANE_FILES.map(read).join("\n").toLowerCase();
    const hexes = new Set(PAIRS.flatMap((p) => [p.fg, p.bg]).filter((n) => !n.startsWith("--")));
    for (const hex of hexes) expect(paneText, hex).toContain(hex);
  });

  it("every Pane colour declaration is a pair of the table on the background it is drawn on", () => {
    const keys = new Set(PAIRS.map((p) => `${p.fg}|${p.bg}`));
    const seen: string[] = [];
    for (const path of PANE_FILES) {
      const decls = paneDeclarations(path);
      const fileBg = nameOf(decls.find((d) => d.prop === "background")?.value ?? "");
      for (const d of decls.filter((x) => x.prop === "color" && x.value.trim() !== "inherit")) {
        const own = decls.find((x) => x.selector === d.selector && x.prop === "background");
        // `.failing` is only drawn inside a Failing_Block, so its background is `--fail`.
        const bg =
          d.selector.trim() === ".failing" ? "--fail" : (nameOf(own?.value ?? "") ?? fileBg);
        const fg = nameOf(d.value);
        const where = `${path}:${String(d.line)} ${d.selector}`;
        const key = `${fg ?? "none"}|${bg ?? "none"}`;
        seen.push(where);
        expect(fg, `${where} colour is not a Token or Pane hex`).not.toBeNull();
        expect(bg, `${where} has no background`).not.toBeNull();
        expect(keys.has(key), `${where}: ${key}`).toBe(true);
      }
    }
    expect(seen.length).toBeGreaterThan(10);
  });

  it("every color declaration outside the Pane resolves to a Token that is a text colour of the table", () => {
    const textTokens = new Set(PAIRS.map((p) => p.fg).filter((n) => n.startsWith("--")));
    const sheets = readSources(["app", "src"], /\.css$/).filter(
      (s) => !s.path.startsWith("src/pane/") && !s.path.endsWith("print-view.module.css"),
    );
    let checked = 0;
    for (const s of sheets) {
      for (const d of parseCss(s.text).declarations.filter((x) => x.prop === "color")) {
        const v = d.value.trim();
        if (v === "inherit" || v === "currentcolor") continue;
        const name = nameOf(v);
        const where = `${s.path}:${String(d.line)}`;
        checked += 1;
        expect(name, `${where} color ${v} is not a Token`).not.toBeNull();
        expect(textTokens.has(name ?? ""), `${where} ${name ?? ""} is not in the table`).toBe(true);
      }
    }
    expect(checked).toBeGreaterThan(10);
  });

  it("a planted pair below its threshold is caught", () => {
    expect(contrastRatio("#ffffff", "#ffffff")).toBeCloseTo(1, 5);
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(measure({ fg: "--muted", bg: "--rule" })).toBeLessThan(4.5);
    expect(measure({ fg: "--oxblood", bg: "--fail" })).toBeLessThan(7);
  });
});
