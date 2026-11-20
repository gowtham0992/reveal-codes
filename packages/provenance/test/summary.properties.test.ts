import type { Document } from "@reveal-codes/engine";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  summarize,
  type SummaryInput,
  type SummaryRecord,
  type SummaryUnchanged,
} from "../src/core/summary.js";
import { arbBuiltRecord } from "../src/testing/arbitraries.js";
import { runs } from "./support/fc.js";

type Origin = "AI" | "AI>HUM" | "HUM" | "PST";
type Counts = Record<Origin, number>;
const ORIGINS: readonly Origin[] = ["AI", "AI>HUM", "HUM", "PST"];

/** Paths share directories, and `src/core.ts` must not fall under the scope `src/core`. */
const POOL = [
  "README.md",
  "lib/c.ts",
  "src/a.ts",
  "src/b.ts",
  "src/core.ts",
  "src/core/x.ts",
  "src/core/y.ts",
  "docs/z.md",
];
const SCOPES: readonly (string | null)[] = [
  null,
  ".",
  "src",
  "./src/",
  "src/core",
  "lib/c.ts",
  "src/a.ts",
  "docs",
  "nope",
];

type Entry =
  | { kind: "record"; path: string; doc: Document; stale: boolean }
  | { kind: "unchanged"; path: string; length: number; stale: boolean };

const arbBody = fc.oneof(
  fc.record({ kind: fc.constant("record" as const), doc: arbBuiltRecord, stale: fc.boolean() }),
  fc.record({
    kind: fc.constant("unchanged" as const),
    length: fc.oneof(fc.constant(0), fc.nat({ max: 60 })),
    stale: fc.boolean(),
  }),
);

const arbEntries: fc.Arbitrary<Entry[]> = fc
  .uniqueArray(fc.constantFrom(...POOL), { maxLength: POOL.length })
  .chain((paths) =>
    fc.array(arbBody, { minLength: paths.length, maxLength: paths.length }).map((bodies) =>
      paths.flatMap((path, i): Entry[] => {
        const body = bodies[i];
        return body === undefined ? [] : [{ ...body, path }];
      }),
    ),
  );

const arbInput = fc.record({
  entries: arbEntries,
  all: fc.boolean(),
  scope: fc.constantFrom(...SCOPES),
  top: fc.option(fc.integer({ min: 1, max: 12 }), { nil: undefined }),
});

const zero = (): Counts => ({ AI: 0, "AI>HUM": 0, HUM: 0, PST: 0 });

function normalize(scope: string | null): string | null {
  if (scope === null) return null;
  let s = scope;
  while (s.startsWith("./")) s = s.slice(2);
  while (s.endsWith("/")) s = s.slice(0, -1);
  return s === "" || s === "." ? null : s;
}

const inScope = (path: string, scope: string | null): boolean =>
  scope === null || path === scope || path.startsWith(scope + "/");

type Expected = { path: string; characters: number; counts: Counts; stale: boolean };
type Piece = { path: string; offset: number; length: number };

/** Counts straight from each Document's spans, or from the length of an Unchanged_File. */
function expectFile(e: Entry): Expected {
  const counts = zero();
  if (e.kind === "unchanged") {
    counts.PST = e.length;
    return { path: e.path, characters: e.length, counts, stale: e.stale };
  }
  for (const s of e.doc.spans) counts[s.provenance.origin] += s.end - s.start;
  return { path: e.path, characters: e.doc.text.length, counts, stale: e.stale };
}

function aiPieces(entries: readonly Entry[]): Piece[] {
  const out: Piece[] = [];
  for (const e of entries) {
    if (e.kind !== "record") continue;
    for (const s of e.doc.spans) {
      if (s.provenance.origin === "AI" && s.end > s.start) {
        out.push({ path: e.path, offset: s.start, length: s.end - s.start });
      }
    }
  }
  return out;
}

function byRule(a: Piece, b: Piece): number {
  if (a.length !== b.length) return b.length - a.length;
  if (a.path !== b.path) return a.path < b.path ? -1 : 1;
  return a.offset - b.offset;
}

function toInput(
  entries: readonly Entry[],
  scope: string | null,
  top: number | undefined,
  all: boolean,
): SummaryInput {
  const records: SummaryRecord[] = [];
  const unchanged: SummaryUnchanged[] = [];
  for (const e of entries) {
    if (e.kind === "record") records.push({ path: e.path, doc: e.doc, stale: e.stale });
    else unchanged.push({ path: e.path, length: e.length, stale: e.stale });
  }
  const base: SummaryInput = { records, unchanged, path: scope, sessions: 0, all };
  return top === undefined ? base : { ...base, top };
}

/** Reads the printed counts and shares of one output line, in tenths of a percent. */
function parseLine(line: string): { chars: number; counts: Counts; tenths: Counts } {
  const chars = Number(/(\d+) characters:/u.exec(line)?.[1]);
  const counts = zero();
  const tenths = zero();
  const re = /(AI>HUM|AI|HUM|PST) (\d+) \((\d+)\.(\d)%\)/gu;
  for (const m of line.matchAll(re)) {
    const o = m[1] as Origin;
    counts[o] = Number(m[2]);
    tenths[o] = Number(m[3]) * 10 + Number(m[4]);
  }
  return { chars, counts, tenths };
}

function checkPrinted(line: string, want: { characters: number; counts: Counts }): void {
  const got = parseLine(line);
  checkParsed(got, want);
}

function checkParsed(
  got: { chars: number; counts: Counts; tenths: Counts },
  want: { characters: number; counts: Counts },
): void {
  expect(got.chars).toBe(want.characters);
  expect(got.counts).toEqual(want.counts);
  const sum = ORIGINS.reduce((acc, o) => acc + got.tenths[o], 0);
  if (want.characters === 0) {
    expect(got.tenths).toEqual(zero());
    return;
  }
  expect(Math.abs(sum - 1000)).toBeLessThanOrEqual(2);
  for (const o of ORIGINS) {
    const exact = (want.counts[o] * 1000) / want.characters;
    expect(Math.abs(got.tenths[o] - exact)).toBeLessThanOrEqual(0.5 + 1e-9);
  }
}

/** One row of the file list: the characters, then count and share of each Origin. */
function parseRow(row: string): { chars: number; counts: Counts; tenths: Counts } {
  const chars = Number(/^\S+ +(\d+)/u.exec(row)?.[1]);
  const counts = zero();
  const tenths = zero();
  const found = [...row.matchAll(/(\d+) \((\d+)\.(\d)%\)/gu)];
  for (const [i, o] of ORIGINS.entries()) {
    counts[o] = Number(found[i]?.[1]);
    tenths[o] = Number(found[i]?.[2]) * 10 + Number(found[i]?.[3]);
  }
  return { chars, counts, tenths };
}

const isListed = (f: Expected): boolean =>
  f.stale || f.counts.AI + f.counts["AI>HUM"] + f.counts.HUM > 0;

function checkFileList(
  out: ReturnType<typeof summarize>,
  want: readonly Expected[],
  all: boolean,
): void {
  const listed = all ? want : want.filter(isListed);
  const at = out.lines.indexOf("Files:");
  const rows = out.lines.slice(at + 2, at + 2 + listed.length);
  expect(rows.map((r) => r.split(" ")[0])).toEqual(listed.map((f) => f.path));
  for (const [i, f] of listed.entries()) {
    const row = rows[i] ?? "";
    expect(row.endsWith(" stale")).toBe(f.stale);
    checkParsed(parseRow(row), f);
  }
  expect(out.summary?.listed.map((f) => f.path)).toEqual(listed.map((f) => f.path));
  const n = want.length - listed.length;
  expect(out.summary?.unchangedCount).toBe(n);
  expect(listed.length + n).toBe(want.length);
  const found = out.lines.filter((l) => l.includes("unchanged since recording started"));
  const noun = n === 1 ? "file" : "files";
  const line = `${String(n)} ${noun} unchanged since recording started, all [PST].`;
  expect(found).toEqual(all ? [] : [line]);
}

function check(
  entries: readonly Entry[],
  rawScope: string | null,
  top: number | undefined,
  all: boolean,
): void {
  const input = toInput(entries, rawScope, top, all);
  const out = summarize(input);
  const scope = normalize(rawScope);
  const kept = entries.filter((e) => inScope(e.path, scope));
  if (entries.length === 0) {
    expect(out.summary).toBeNull();
    expect(out.status).toBe(1);
    return;
  }
  if (kept.length === 0) {
    expect(out.summary).toBeNull();
    return;
  }
  const summary = out.summary;
  if (summary === null) throw new Error("expected a summary");
  const want = kept.map(expectFile).sort((a, b) => (a.path < b.path ? -1 : 1));
  expect(summary.files.map((f) => f.path)).toEqual(want.map((f) => f.path));
  expect(summary.files.map((f) => f.stale)).toEqual(want.map((f) => f.stale));
  for (const [i, f] of summary.files.entries()) {
    expect(f.characters).toBe(want[i]?.characters);
    expect(f.counts).toEqual(want[i]?.counts);
    expect(ORIGINS.reduce((acc, o) => acc + f.counts[o], 0)).toBe(f.characters);
  }
  checkFileList(out, want, all);
  const total = zero();
  for (const f of want) for (const o of ORIGINS) total[o] += f.counts[o];
  const chars = want.reduce((acc, f) => acc + f.characters, 0);
  expect(summary.total).toEqual(total);
  expect(summary.totalCharacters).toBe(chars);
  const totalLine = out.lines.find((l) => l.startsWith("Total: "));
  checkPrinted(totalLine ?? "", { characters: chars, counts: total });

  const pieces = aiPieces(kept)
    .sort(byRule)
    .slice(0, top ?? 10);
  expect(
    summary.stretches.map((s) => ({ path: s.path, offset: s.offset, length: s.length })),
  ).toEqual(pieces);
  expect(summary.omittedAiHuman).toBe(total["AI>HUM"]);
  expect(out.lines).toContain(
    `AI>HUM characters left out of this list: ${String(total["AI>HUM"])}`,
  );

  const again = summarize(input);
  expect(again.text).toBe(out.text);
  expect(again.summary).toEqual(summary);
}

describe("summarize properties _Requirements: 10.2, 10.3, 10.5, 10.8, 10.13, 10.14, 10.15_", () => {
  // Property 12
  it("counts add up, listed files plus the unchanged count equal the summarized files (all listed with --all), stretches are ordered and AI>HUM is counted", () => {
    fc.assert(
      fc.property(arbInput, ({ entries, scope, top, all }) => {
        check(entries, scope, top, all);
      }),
      { numRuns: runs(process.env) },
    );
  });
});
