import { localDate } from "./time.js";

const MAX_SLUG = 60;

function slugOf(caption: string): string {
  const dashed = caption
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const cut = dashed.slice(0, MAX_SLUG).replace(/-+$/, "");
  return cut === "" ? "filing" : cut;
}

/**
 * `<slug>-<YYYY-MM-DD>.docx` with the local date of `now` (host zone, not UTC).
 * Precondition: `now` is a valid Date.
 */
export function exportFileName(caption: string, now: Date): string {
  return `${slugOf(caption)}-${localDate(now)}.docx`;
}
