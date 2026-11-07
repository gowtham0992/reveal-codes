/**
 * Validity checks for Property 43 (design "Correctness Properties",
 * [arbitraries]; Req 22.4). Each check is independent of the generator: the
 * lists below are typed from the Glossary, and the Engine's own validators
 * (`checkCoverage`, `checkProvenance`, `isTimestamp`) are used only where the
 * Requirement is stated in terms of them. Kept here so
 * arbitraries.properties.test.ts stays under the 300-line module limit.
 */
import { checkCoverage } from "../../src/spans";
import type { Document, Provenance } from "../../src/types";
import { checkProvenance, firstUnpairedSurrogate, isTimestamp } from "../../src/validate";

const hasRunId = (p: Provenance): boolean => Object.prototype.hasOwnProperty.call(p, "runId");

/** Test-local Mergeable (Glossary): equal Origins and equal-or-both-absent Run_Ids. */
const mergeable = (a: Provenance, b: Provenance): boolean =>
  a.origin === b.origin && hasRunId(a) === hasRunId(b) && a.runId === b.runId;

/** Every rule a generated Document breaks, as readable strings (empty when valid). */
export function documentFaults(doc: Document): readonly string[] {
  const out: string[] = [];
  const cover = checkCoverage(doc.text.length, doc.spans);
  if (!cover.ok) out.push(`coverage: ${JSON.stringify(cover.error)}`);
  if (firstUnpairedSurrogate(doc.text) !== null) out.push("unpaired surrogate in text");
  doc.spans.forEach((s, i) => {
    const prev = doc.spans[i - 1];
    if (prev !== undefined && mergeable(prev.provenance, s.provenance))
      out.push(`mergeable at ${String(i)}`);
    const p = checkProvenance(s.provenance);
    if (!p.ok) out.push(`provenance (Req 2.5) at ${String(i)}: ${JSON.stringify(p.error)}`);
    if (!isTimestamp(s.provenance.timestamp)) out.push(`timestamp at ${String(i)}`);
    out.push(...runFaults(doc, s.provenance, i));
  });
  return out;
}

/** Req 6.12 for one span: a Run table entry exists and its flag matches the Origin. */
function runFaults(doc: Document, p: Provenance, i: number): readonly string[] {
  if (p.runId === undefined) return [];
  const entry = doc.runs.find((r) => r.runId === p.runId);
  if (entry === undefined) return [`no Run entry for ${p.runId} at ${String(i)}`];
  const want = entry.relabelled ? "AI>HUM" : "AI";
  return p.origin === want
    ? []
    : [`Run ${p.runId} flag ${String(entry.relabelled)} but ${p.origin} at ${String(i)}`];
}

/** Glossary Party_Stop_List, typed here: the fourteen Signals, then seven more. */
export const GLOSSARY_STOP_LIST: readonly string[] = [
  ...["See", "See also", "See, e.g.,", "E.g.,", "Accord", "Cf.", "But see", "Compare"],
  ...["Citing", "Quoting", "But cf.", "Contra", "E.g.", "See generally"],
  ...["In", "As", "Under", "Following", "Applying", "The court in", "The Court in"],
];

/** Glossary Connectors. */
export const GLOSSARY_CONNECTORS: readonly string[] = ["&", "of", "the", "and", "ex rel."];

/** Glossary Entity_Suffix words. */
export const GLOSSARY_SUFFIXES: readonly string[] = [
  ...["Inc.", "LLC", "L.L.C.", "Ltd.", "Co.", "Corp.", "L.P.", "N.A."],
];

/** Glossary Gap_Signal list: ten capitalised, then each lower-case-first. Excludes `with`. */
export const GLOSSARY_GAP_SIGNALS: readonly string[] = [
  ...["See", "See also", "See, e.g.,", "E.g.,", "Accord", "Cf.", "But see", "Compare"],
  ...["Citing", "Quoting"],
  ...["see", "see also", "see, e.g.,", "e.g.,", "accord", "cf.", "but see", "compare"],
  ...["citing", "quoting"],
];

/**
 * Glossary Unlisted_Lexis_Court, shape clauses only (the "matches no entry"
 * clause is checked by the caller against `lexis-courts.json`): 1 to 40 code
 * units; tokens separated by single U+0020; every token starts with an ASCII
 * uppercase letter or digit; no token is a year 1600-2999; no token holds `,`,
 * whitespace, a parenthesis, or `"` `“` `”`; no token is `LEXIS`; the first
 * token is not `WL`. Typed from the Glossary; shares no code with the Engine.
 */
export function isGlossaryUnlistedShape(court: string): boolean {
  const tokenOk = (t: string): boolean =>
    /^[A-Z0-9][^\s(),"“”]*$/.test(t) &&
    !(/^[0-9]{4}$/.test(t) && Number(t) >= 1600 && Number(t) <= 2999) &&
    t !== "LEXIS";
  const tokens = court.split(" ");
  return court.length >= 1 && court.length <= 40 && tokens[0] !== "WL" && tokens.every(tokenOk);
}

/** Count of non-overlapping occurrences of `needle` in `s`. */
export function countOf(s: string, needle: string): number {
  return s.split(needle).length - 1;
}

/** Number of ` , <Entity_Suffix>` tails in a side: `, Inc.` and so on, each as a whole word. */
function suffixCount(side: string): number {
  return GLOSSARY_SUFFIXES.reduce((n, w) => {
    const re = new RegExp(`, ${w.replace(/\./g, "\\.")}(?= |,|$)`, "g");
    return n + (side.match(re)?.length ?? 0);
  }, 0);
}

/** Every rule a generated `arbShortFormParty` value breaks (Property 43). */
export function partyFaults(party: string, maxParty: number): readonly string[] {
  const out: string[] = [];
  if (party.length === 0 || party.length > maxParty) out.push(`length ${String(party.length)}`);
  if (countOf(party, " v. ") > 1) out.push("more than one ' v. '");
  for (const side of party.split(" v. ")) {
    if (suffixCount(side) > 1) out.push(`more than one Entity_Suffix in "${side}"`);
  }
  const entry = GLOSSARY_STOP_LIST.find((e) => party.startsWith(`${e} `));
  if (entry !== undefined) out.push(`begins with stop-list entry "${entry}"`);
  return out;
}

/** True when `s` is whole stop-list entries and Connectors, each then one space, starting with an entry. */
export function isStopListPrefix(s: string): boolean {
  if (s === "") return true;
  return GLOSSARY_STOP_LIST.some((e) => s.startsWith(`${e} `) && isTail(s.slice(e.length + 1)));
}

function isTail(s: string): boolean {
  if (s === "") return true;
  return [...GLOSSARY_STOP_LIST, ...GLOSSARY_CONNECTORS].some(
    (w) => s.startsWith(`${w} `) && isTail(s.slice(w.length + 1)),
  );
}
