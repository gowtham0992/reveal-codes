/**
 * Hook payload arbitraries (Property 13). Built only from fast-check
 * combinators, so every value shrinks. Only `src/testing/` imports fast-check.
 */
import fc from "fast-check";
import { STDIN_MAX } from "../core/limits.js";

/** Every secret value carries this prefix, so a leak into a result is detectable by substring. */
export const SECRET_PREFIX = "SECRET\u2063";

/** A string that never contains the secret prefix, so it cannot collide with a secret. */
const arbPlain: fc.Arbitrary<string> = fc
  .string({ maxLength: 30 })
  .filter((s) => !s.includes(SECRET_PREFIX));

const arbSecret: fc.Arbitrary<string> = arbPlain.map((s) => SECRET_PREFIX + s);

/** Any JSON value that is not a string, a boolean or null-free object: used for wrongly typed fields. */
const arbOtherJson: fc.Arbitrary<unknown> = fc.oneof(
  fc.constant(null),
  fc.integer(),
  fc.boolean(),
  fc.array(arbPlain, { maxLength: 3 }),
  fc.dictionary(fc.constantFrom("a", "b"), arbPlain, { maxKeys: 2 }),
);

const arbSpecName: fc.Arbitrary<string> = fc
  .tuple(
    fc.constantFrom("", "/", ".kiro/specs/", "/abs/path/.kiro/specs/", "C:\\x\\specs\\"),
    fc.constantFrom("kiro-provenance", "a b", "x", ".."),
    fc.constantFrom("", "/tasks.md", "\\tasks.md", "/"),
  )
  .map(([a, b, c]) => a + b + c);

/** A field value: usually of the right type, sometimes of another type. */
function field(right: fc.Arbitrary<unknown>): fc.Arbitrary<unknown> {
  return fc.oneof({ weight: 4, arbitrary: right }, { weight: 1, arbitrary: arbOtherJson });
}

/** The five known fields, each present or absent, each of the right type or not. */
const arbKnownFields: fc.Arbitrary<Record<string, unknown>> = fc.record(
  {
    session_id: field(fc.oneof(arbPlain, fc.constant(""))),
    cwd: field(arbPlain),
    task_name: field(arbPlain),
    spec_name: field(arbSpecName),
    task_success: field(fc.boolean()),
  },
  { requiredKeys: [] },
);

/** Extra fields, among them `prompt`, `tool_input` and `tool_response`, whose strings are secrets. */
const arbExtraFields: fc.Arbitrary<Record<string, unknown>> = fc.record(
  {
    prompt: arbSecret,
    tool_input: fc.record({ path: arbSecret, text: arbSecret }),
    tool_response: fc.record({ output: arbSecret }),
    hook_event_name: arbPlain,
    other: fc.array(arbPlain, { maxLength: 3 }),
  },
  { requiredKeys: [] },
);

/** An object payload: the known fields alone, and the same with extra fields added. */
export type ObjectPayloadCase = {
  readonly kind: "object";
  readonly known: Readonly<Record<string, unknown>>;
  readonly withoutExtras: string;
  readonly withExtras: string;
  /** Every secret string placed in the extra fields. */
  readonly secrets: readonly string[];
};

/** A text that must give the empty payload. */
export type EmptyPayloadCase = { readonly kind: "empty"; readonly text: string };

export type PayloadCase = ObjectPayloadCase | EmptyPayloadCase;

function collectSecrets(value: unknown, out: string[]): string[] {
  if (typeof value === "string") {
    if (value.startsWith(SECRET_PREFIX)) out.push(value);
  } else if (typeof value === "object" && value !== null) {
    for (const item of Object.values(value)) collectSecrets(item, out);
  }
  return out;
}

const arbObjectCase: fc.Arbitrary<ObjectPayloadCase> = fc
  .tuple(arbKnownFields, arbExtraFields)
  .map(([known, extras]) => ({
    kind: "object",
    known,
    withoutExtras: JSON.stringify(known),
    withExtras: JSON.stringify({ ...extras, ...known }),
    secrets: collectSecrets(extras, []),
  }));

/** Texts that are valid JSON but not an object. */
const arbNonObject: fc.Arbitrary<string> = fc
  .oneof(
    fc.constant(null),
    fc.integer(),
    fc.boolean(),
    arbPlain,
    fc.array(arbPlain, { maxLength: 3 }),
  )
  .map((v) => JSON.stringify(v));

/** Texts that are not JSON: a leading `}` or an unfinished value. */
const arbNotJson: fc.Arbitrary<string> = fc.oneof(
  arbPlain.map((s) => `}${s}`),
  arbPlain.map((s) => `{"session_id":"${s.replace(/["\\]/g, "")}`),
  fc.constantFrom("", "{", "[1,", "not json"),
);

/** A well-formed object whose UTF-8 encoding is over STDIN_MAX bytes. */
const arbOversize: fc.Arbitrary<string> = fc
  .tuple(
    fc.constantFrom("a", "\u00e9", "\u20ac", "\u{1F600}"),
    fc.integer({ min: 1, max: 50 }),
    arbPlain,
  )
  .map(([unit, extra, sid]) => {
    const bytes = new TextEncoder().encode(unit).length;
    const count = Math.floor(STDIN_MAX / bytes) + extra;
    return JSON.stringify({ session_id: `x${sid}`, pad: unit.repeat(count) });
  });

const arbEmptyCase: fc.Arbitrary<EmptyPayloadCase> = fc
  .oneof(arbNonObject, arbNotJson, arbOversize)
  .map((text) => ({ kind: "empty", text }));

/** Object payloads with extra fields, and texts that must give the empty payload. */
export const arbPayloadCase: fc.Arbitrary<PayloadCase> = fc.oneof(
  { weight: 3, arbitrary: arbObjectCase },
  { weight: 2, arbitrary: arbEmptyCase },
);
