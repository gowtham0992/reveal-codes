import { parseCss } from "../support/css";
import { violation, type Violation } from "../support/scan";

/** Stylesheet rules shared by the page scans (`/courts` and `/check`): Requirements 10.2, 10.3, 10.4, 16.1. */
const SIZES = new Set([
  "10.5px",
  "11px",
  "12px",
  "12.5px",
  "13px",
  "13.5px",
  "14px",
  "15px",
  "18px",
  "20px",
  "26px",
  "inherit",
]);
const WEIGHTS = /^(?:400|500|600|700)$/;
const BANNED =
  /^(?:box-shadow|text-shadow|backdrop-filter|transition(?:-.+)?|animation(?:-.+)?|border(?:-[a-z]+)*-radius)$/;
const FIXED_WIDTH = /^(?:min-)?width$/;

export function sheetViolations(path: string, text: string): Violation[] {
  const css = parseCss(text);
  const found = css.declarations.flatMap((d) => {
    const v = d.value.trim();
    const out: string[] = [];
    if (BANNED.test(d.prop)) out.push(`${d.prop} is not allowed`);
    if (/gradient\s*\(/i.test(v)) out.push("gradient");
    if (d.prop === "font-size" && !SIZES.has(v)) out.push(`font-size ${v}`);
    if (d.prop === "font-weight" && !WEIGHTS.test(v)) out.push(`font-weight ${v}`);
    if (FIXED_WIDTH.test(d.prop) && !/^(?:100%|auto|min-content|max-content|0)$/.test(v))
      out.push(`${d.prop} ${v} is a fixed width`);
    return out.map((m) => violation(path, d.line, m));
  });
  const queries = css.atRules
    .filter((r) => /\b(?:min|max)-width\b/.test(r.prelude))
    .map((r) => violation(path, r.line, `width query ${r.prelude}`));
  return [...found, ...queries];
}
