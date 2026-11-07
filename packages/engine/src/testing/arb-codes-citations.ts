/**
 * Citation, reference, Override, and key tampers (`arb-codes.ts`; Req 20.4,
 * 16.5, D23, 22.1). Same contract as `arb-codes-tampers.ts`: the rule and
 * input index are recorded from where the edit lands.
 */
import fc from "fast-check";
import { fullRecordsOf, isUnlistedLexisRecord } from "./arb-state.js";
import {
  TS,
  closeOf,
  edited,
  insertEdit,
  keyOf,
  named,
  pick,
  replaceCode,
  tamper,
  withCounter,
} from "./arb-codes-scan.js";
import type { Builder, CodePiece, Scanned } from "./arb-codes-scan.js";
import type { Document } from "../types.js";

type ShortInfo = Readonly<{ code: CodePiece; key: string; derived: string }>;

/** Short_Form records with their Code and the status Req 12.4, 12.5 derive for them. */
function shortForms(doc: Document, s: Scanned): readonly ShortInfo[] {
  return doc.citations.flatMap((r) => {
    const v = r.citation.value;
    if (r.kind !== "short" || v.kind !== "short") return [];
    const code = named(s, "CIT ").find((x) => keyOf(x) === r.key);
    const target = doc.citations.find(
      (t) => t.kind === "full" && t.citation.start === v.targetStart,
    );
    const derived = target?.kind === "full" ? target.result.status : "unchecked";
    return code === undefined ? [] : [{ code, key: r.key, derived }];
  });
}

/** A Short_Form Code with a status other than the one derived from its target. */
export const shortCode: Builder = (c) =>
  pick(shortForms(c.doc, c.s), ({ code, key, derived }) => {
    const wrong = derived === "unchecked" ? `[CIT ✘{k=${key}}]` : `[CIT …{k=${key}}]`;
    return tamper("short_code", "short_form_code", code.start, edited(c, replaceCode(code, wrong)));
  });

/** A `[CIT ?:N]` Short_Form with a count other than its target's. */
export const shortCount: Builder = (c) =>
  pick(
    shortForms(c.doc, c.s).filter((x) => x.derived === "ambiguous"),
    ({ code }) => {
      const n = Number(/^\[CIT \?:(\d+)/.exec(code.text)?.[1] ?? "0");
      const text = code.text.replace(/^\[CIT \?:\d+/, `[CIT ?:${String(n + 1)}`);
      return tamper(
        "short_count",
        "short_form_code",
        code.start,
        edited(c, replaceCode(code, text)),
      );
    },
  );

/**
 * D23: `[CIT ✓{k=<same key>;cl=<id>}]` on an unlisted LEXIS Database_Citation.
 * Skipped for a citation with linked Short_Forms: their derived status would
 * change first and be reported as `short_form_code` instead.
 */
export const unverifiableLexis: Builder = (c) => {
  const linked = (start: number): boolean =>
    c.doc.citations.some((r) => {
      const v = r.citation.value;
      return r.kind === "short" && v.kind === "short" && v.targetStart === start;
    });
  const recs = fullRecordsOf(c.doc).filter(
    (r) => isUnlistedLexisRecord(r) && !linked(r.citation.start),
  );
  const options = recs.flatMap((r) => {
    const code = named(c.s, "CIT ").find((x) => keyOf(x) === r.key);
    return code === undefined ? [] : [{ code, key: r.key }];
  });
  if (options.length === 0) return undefined;
  return fc
    .constantFrom(...options)
    .chain(({ code, key }) =>
      fc
        .nat(999)
        .map((id) =>
          tamper(
            "unverifiable_lexis",
            "unverifiable_status",
            code.start,
            edited(c, replaceCode(code, `[CIT ✓{k=${key};cl=${String(id + 1)}}]`)),
          ),
        ),
    );
};

const refPairs = (s: Scanned): readonly (readonly [CodePiece, CodePiece])[] =>
  s.codes
    .filter((x) => x.name === "REF")
    .flatMap((o) => {
      const close = closeOf(s, o, "/REF");
      return close === undefined ? [] : [[o, close] as const];
    });

/** A citation Code at an Other_Reference range (Req 20.4, `ref_code`). */
export const refAsCit: Builder = (c) =>
  pick(refPairs(c.s), ([o, close]) =>
    tamper(
      "ref_as_cit",
      "ref_code",
      o.start,
      edited(c, replaceCode(o, "[CIT …{k=k0}]"), replaceCode(close, "[/CIT]")),
    ),
  );

/** An `[OVR]` right after a `[REF]`, reported at the `[OVR]`. */
export const refOverride: Builder = (c) =>
  pick(refPairs(c.s), ([o]) =>
    tamper("ref_override", "ref_code", o.end, edited(c, insertEdit(o.end, `[OVR:why{t=${TS}}]`))),
  );

/** An `[OVR]` on a verified citation or a matching quote, which are not Issues. */
export const overrideNonIssue: Builder = (c) => {
  const targets = c.s.codes.filter(
    (x) =>
      (x.name === "CIT ✓" || x.name === "QUO ✓") &&
      !c.s.codes.some((o) => o.name === "OVR" && o.start === x.end),
  );
  if (targets.length === 0) return undefined;
  return fc
    .constantFrom(...targets)
    .chain((t) =>
      fc
        .constantFrom("why", "because", "x y")
        .map((reason) =>
          tamper(
            "override_nonissue",
            "override_target",
            t.end,
            edited(c, insertEdit(t.end, `[OVR:${reason}{t=${TS}}]`)),
          ),
        ),
    );
};

const keyed = (s: Scanned): readonly CodePiece[] =>
  s.codes.filter((x) => x.name.startsWith("CIT ") || x.name.startsWith("QUO "));

/** `n=0` in `[DOC]`: every key is then at or above the counter; reported at the first keyed Code. */
export const issueKeyCounter: Builder = (c) => {
  const first = keyed(c.s)[0];
  const bumped = withCounter(c.s, () => 0);
  if (first === undefined || bumped === undefined) return undefined;
  return fc.constant(
    tamper("issue_key_counter", "issue_key", first.start + bumped.delta, bumped.text),
  );
};

/** The second keyed Code reuses the first one's key, reported at the second. */
export const issueKeyDuplicate: Builder = (c) => {
  const [first, second] = keyed(c.s);
  const key = first === undefined ? undefined : keyOf(first);
  if (second === undefined || key === undefined) return undefined;
  const text = second.text.replace(/([{;]k=)[^;}]*/, `$1${key}`);
  return fc.constant(
    tamper("issue_key_duplicate", "issue_key", second.start, edited(c, replaceCode(second, text))),
  );
};
