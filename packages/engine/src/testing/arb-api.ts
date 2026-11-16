/**
 * `arbApiCall(d)` (design "Arbitraries" table, Property 42; Req 22.1): one
 * call to any function exported by `src/index.ts`, with arguments derived
 * from the Document `d`, failing ones included (unknown keys, out-of-range
 * ops, bad payloads, blank reasons, bad Timestamps, malformed codes text).
 * A call is plain data, `{ name, args, run }`, where `run(args)` invokes the
 * public function, so a property can deep-freeze `args`, run twice, and
 * compare. Arguments come from the shared arbitraries; the Engine's own
 * functions are called only through `src/index.ts`.
 */
import fc from "fast-check";
import {
  apply,
  blockingIssues,
  checkToolName,
  createDocument,
  declareAi,
  declareNone,
  extract,
  format,
  holdsSubstantivePasted,
  insertsPasted,
  isDeclaration,
  issues,
  normalise,
  normaliseSpans,
  overrides,
  parse,
  parseRecord,
  recordOverride,
  render,
  renderRecord,
  segment,
  setQuoteCheck,
  setVerification,
  strip,
  stripPositions,
  verificationOf,
} from "../index.js";
import type { Declaration, DeclarationSubject } from "../declaration.js";
import type { CodePosition, Document, EngineConfig, Operation, RenderMode } from "../types.js";
import { arbBadTimestamp } from "./arb-bad-timestamp.js";
import { arbBadToolName, arbDeclaration, arbToolName } from "./arb-declaration.js";
import { arbCitation } from "./arb-citation.js";
import { arbValueCorruption } from "./arb-citation-corrupt.js";
import { arbSyntaxFault, arbSemanticTamper } from "./arb-codes.js";
import { arbFaultyOp } from "./arb-faulty-op.js";
import { arbOp, arbThreshold } from "./arb-ops.js";
import { arbSpanCorruption } from "./arb-spans.js";
import { arbBadQuoteWrite, arbBadVerificationWrite } from "./arb-state-bad.js";
import {
  arbBlankReason,
  arbQuoteCheckResult,
  arbReason,
  arbVerificationResult,
  fullRecordsOf,
} from "./arb-state.js";
import { arbAnyString, arbText, arbTimestamp } from "./arb-text.js";

/** Every function exported by `src/index.ts`, in declaration order. */
export const API_NAMES = [
  "createDocument",
  "apply",
  "normalise",
  "normaliseSpans",
  "segment",
  "extract",
  "format",
  "setVerification",
  "setQuoteCheck",
  "verificationOf",
  "issues",
  "blockingIssues",
  "overrides",
  "recordOverride",
  "render",
  "parse",
  "strip",
  "stripPositions",
  "checkToolName",
  "declareNone",
  "declareAi",
  "isDeclaration",
  "holdsSubstantivePasted",
  "insertsPasted",
  "renderRecord",
  "parseRecord",
] as const;

export type ApiName = (typeof API_NAMES)[number];

type Args = readonly unknown[];

/** One call: the function's name, its arguments, and the way to run it. */
export type ApiCall = Readonly<{
  name: ApiName;
  args: Args;
  run: (args: Args) => unknown;
}>;

/**
 * Invokes each public function on an argument tuple. The tuples are built by
 * the arbitraries below, so the casts only restore the types they erased;
 * malformed payloads are passed on purpose.
 */
export const RUNNERS: Readonly<Record<ApiName, (a: Args) => unknown>> = {
  createDocument: (a) => createDocument(a[0] as string, a[1] as string),
  apply: (a) => apply(a[0] as Document, a[1] as Operation, a[2] as EngineConfig | undefined),
  normalise: (a) => normalise(a[0] as Document),
  normaliseSpans: (a) => normaliseSpans(a[0] as number, a[1] as Document["spans"]),
  segment: (a) => segment(a[0] as string, a[1] as Document["spans"]),
  extract: (a) => extract(a[0] as string),
  format: (a) => format(a[0] as Parameters<typeof format>[0]),
  setVerification: (a) =>
    setVerification(
      a[0] as Document,
      a[1] as string,
      a[2] as Parameters<typeof setVerification>[2],
    ),
  setQuoteCheck: (a) =>
    setQuoteCheck(a[0] as Document, a[1] as string, a[2] as Parameters<typeof setQuoteCheck>[2]),
  verificationOf: (a) => verificationOf(a[0] as Document, a[1] as string),
  issues: (a) => issues(a[0] as Document),
  blockingIssues: (a) => blockingIssues(a[0] as Document),
  overrides: (a) => overrides(a[0] as Document),
  recordOverride: (a) =>
    recordOverride(a[0] as Document, a[1] as string, a[2] as string, a[3] as string),
  render: (a) => render(a[0] as Document, a[1] as RenderMode),
  parse: (a) => parse(a[0] as string),
  strip: (a) => strip(a[0] as string),
  stripPositions: (a) => stripPositions(a[0] as readonly CodePosition[]),
  checkToolName: (a) => checkToolName(a[0] as string),
  declareNone: (a) => declareNone(a[0] as DeclarationSubject),
  declareAi: (a) => declareAi(a[0] as DeclarationSubject, a[1] as string),
  isDeclaration: (a) => isDeclaration(a[0]),
  holdsSubstantivePasted: (a) => holdsSubstantivePasted(a[0] as Document),
  insertsPasted: (a) => insertsPasted(a[0] as Operation),
  renderRecord: (a) =>
    renderRecord(a[0] as Document, a[1] as Declaration | null, a[2] as RenderMode),
  parseRecord: (a) => parseRecord(a[0] as string),
};

const docOnly = (d: Document): fc.Arbitrary<Args> => fc.constant([d]);

/** Keys of `d`'s citations and quotes, plus keys no Document has. */
const arbAnyKey = (d: Document): fc.Arbitrary<string> => {
  const known = [
    ...d.citations.flatMap((c) => (c.kind === "other" ? [] : [c.key])),
    ...d.quotes.map((q) => q.key),
  ];
  const unknown = fc.nat().map((n) => `u${String(n)}`);
  return known.length === 0 ? unknown : fc.oneof(fc.constantFrom(...known), unknown);
};

/** A well-formed or faulty Operation, with the config to apply it under. */
function arbApplyArgs(d: Document): fc.Arbitrary<Args> {
  const good = fc.tuple(arbOp(d), arbThreshold).map(([op, t]): Args => [d, op, t.config]);
  const bad = arbFaultyOp(d).map((f): Args => [d, f.op, f.config]);
  const inverse = fc.tuple(arbOp(d), arbThreshold).map(([op, t]): Args => {
    const applied = apply(d, op, t.config);
    return [d, applied.ok ? applied.value.inverse : op, t.config];
  });
  return fc.oneof(good, bad, inverse);
}

function arbCreateArgs(): fc.Arbitrary<Args> {
  const text = fc.oneof(arbText, arbAnyString);
  const stamp = fc.oneof({ arbitrary: arbTimestamp, weight: 3 }, arbBadTimestamp);
  return fc.tuple(text, stamp);
}

function arbSpanArgs(d: Document): fc.Arbitrary<Args> {
  const ok = fc.constant<Args>([d.text.length, d.spans]);
  const bad = arbSpanCorruption.map((c): Args => [c.text.length, c.spans]);
  return fc.oneof(ok, bad);
}

function arbSegmentArgs(d: Document): fc.Arbitrary<Args> {
  const ok = fc.constant<Args>([d.text, d.spans]);
  const bad = arbSpanCorruption.map((c): Args => [c.text, c.spans]);
  const mismatched = arbText.map((t): Args => [t, d.spans]);
  return fc.oneof(ok, bad, mismatched);
}

function arbFormatValue(d: Document): fc.Arbitrary<unknown> {
  const own = d.citations.map((c) => c.citation.value);
  const options: fc.Arbitrary<unknown>[] = [arbCitation, arbValueCorruption.map((c) => c.value)];
  if (own.length > 0) options.push(fc.constantFrom(...own));
  return fc.oneof(...options);
}

function arbVerificationArgs(d: Document): fc.Arbitrary<Args> {
  const bad = arbBadVerificationWrite(d).map((w): Args => [d, w.key, w.result]);
  const keys = fullRecordsOf(d).map((r) => r.key);
  if (keys.length === 0) return bad;
  const good = fc
    .tuple(fc.constantFrom(...keys), arbVerificationResult)
    .map(([key, result]): Args => [d, key, result]);
  return fc.oneof(bad, good);
}

function arbQuoteArgs(d: Document): fc.Arbitrary<Args> {
  const bad = arbBadQuoteWrite(d).map((w): Args => [d, w.key, w.result]);
  if (d.quotes.length === 0) return bad;
  const good = fc
    .constantFrom(...d.quotes)
    .chain((q) => arbQuoteCheckResult(q.quote.end - q.quote.start).map((r): Args => [d, q.key, r]));
  return fc.oneof(bad, good);
}

function arbOverrideArgs(d: Document): fc.Arbitrary<Args> {
  const issueKeys = issues(d).map((i) => i.key);
  const key =
    issueKeys.length === 0 ? arbAnyKey(d) : fc.oneof(fc.constantFrom(...issueKeys), arbAnyKey(d));
  const reason = fc.oneof({ arbitrary: arbReason, weight: 3 }, arbBlankReason);
  const stamp = fc.oneof({ arbitrary: arbTimestamp, weight: 3 }, arbBadTimestamp);
  return fc.tuple(fc.constant(d), key, reason, stamp);
}

/** Reveal Codes text: a faithful rendering, a tampered one, or arbitrary text. */
function arbCodesText(d: Document): fc.Arbitrary<string> {
  const full = render(d, "full").text;
  return fc.oneof(
    fc.constant(full),
    fc.constant(render(d, "display").text),
    arbSyntaxFault(full).map((f) => f.text),
    arbSemanticTamper(d).map((t) => t.text),
    arbAnyString,
  );
}

const arbPositions = (d: Document): fc.Arbitrary<readonly CodePosition[]> =>
  fc.oneof(
    fc.constant(render(d, "display").positions),
    fc.constant(render(d, "full").positions),
    fc.array(fc.record({ offset: fc.integer({ min: -5, max: 3000 }), code: arbAnyString }), {
      maxLength: 8,
    }),
  );

/** A call with one of the document's operations, or an Inverse from `apply`. */
const arbPastedOpArgs = (d: Document): fc.Arbitrary<Args> =>
  arbApplyArgs(d).map((a): Args => [a[1]]);
/** Argument generators, one per exported function. */
const ARGS: Readonly<Record<ApiName, (d: Document) => fc.Arbitrary<Args>>> = {
  createDocument: arbCreateArgs,
  apply: arbApplyArgs,
  normalise: docOnly,
  normaliseSpans: arbSpanArgs,
  segment: arbSegmentArgs,
  extract: (d) => fc.tuple(fc.oneof(fc.constant(d.text), arbText, arbAnyString)),
  format: (d) => fc.tuple(arbFormatValue(d)),
  setVerification: arbVerificationArgs,
  setQuoteCheck: arbQuoteArgs,
  verificationOf: (d) => fc.tuple(fc.constant(d), arbAnyKey(d)),
  issues: docOnly,
  blockingIssues: docOnly,
  overrides: docOnly,
  recordOverride: arbOverrideArgs,
  render: (d) => fc.tuple(fc.constant(d), fc.constantFrom<RenderMode>("full", "display")),
  parse: (d) => fc.tuple(arbCodesText(d)),
  strip: (d) => fc.tuple(fc.oneof(arbCodesText(d), arbAnyString)),
  stripPositions: (d) => fc.tuple(arbPositions(d)),
  checkToolName: () => fc.tuple(arbAnyToolName),
  declareNone: () => fc.tuple(arbSubject),
  declareAi: () => fc.tuple(arbSubject, arbAnyToolName),
  isDeclaration: () => fc.tuple(arbDeclarationLike),
  holdsSubstantivePasted: docOnly,
  insertsPasted: arbPastedOpArgs,
  renderRecord: (d) =>
    fc.tuple(
      fc.constant(d),
      fc.oneof(fc.constant(null), arbDeclaration()),
      fc.constantFrom<RenderMode>("full", "display"),
    ),
  parseRecord: (d) => fc.tuple(arbCodesText(d)),
};

const arbSubject = fc.constantFrom<DeclarationSubject>("pasted_text", "this_filing");
const arbAnyToolName = fc.oneof(arbToolName, arbBadToolName, arbAnyString);
/** A stored Declaration, a malformed look-alike, or something that is not an object. */
const arbDeclarationLike: fc.Arbitrary<unknown> = fc.oneof(
  arbDeclaration(),
  fc.record({ subject: arbSubject, choice: fc.constant("none"), toolName: arbToolName }),
  fc.record({ subject: arbAnyString, choice: fc.constant("declared_ai"), toolName: arbToolName }),
  fc.record({ subject: arbSubject, choice: fc.constant("declared_ai"), toolName: arbAnyToolName }),
  fc.constantFrom(null, undefined, 3, "none"),
);
/** The generator of calls to `name` against `d`. */
export const arbApiCallTo = (name: ApiName, d: Document): fc.Arbitrary<ApiCall> =>
  ARGS[name](d).map((args): ApiCall => ({ name, args, run: RUNNERS[name] }));

/** One call to any exported function, with arguments derived from `d`. */
export function arbApiCall(d: Document): fc.Arbitrary<ApiCall> {
  return fc.constantFrom(...API_NAMES).chain((name) => arbApiCallTo(name, d));
}
