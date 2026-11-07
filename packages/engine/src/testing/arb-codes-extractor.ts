/**
 * Extractor-mismatch tampers (`arb-codes.ts`; Req 20.5, rule
 * `extractor_mismatch`): a `[REF]`, `[CIT …]`, or `[QUO …]` range that no
 * longer equals the Extractor's. A missing Extractor range is reported at
 * index 0; an extra Code at its own input index (design A12 step 3).
 */
import fc from "fast-check";
import type { Arbitrary } from "fast-check";
import {
  applyEdits,
  closeOf,
  insertEdit,
  replaceCode,
  scanRendering,
  tamper,
  usableCuts,
  withCounter,
} from "./arb-codes-scan.js";
import type {
  Builder,
  CodePiece,
  Cut,
  Scanned,
  SemanticTamper,
  TamperCtx,
} from "./arb-codes-scan.js";

type Pair = Readonly<{ o: CodePiece; c: CodePiece }>;

function pairsOf(
  s: Scanned,
  isOpen: (name: string) => boolean,
  closeName: string,
): readonly Pair[] {
  return s.codes
    .filter((x) => isOpen(x.name))
    .flatMap((o) => {
      const c = closeOf(s, o, closeName);
      return c === undefined ? [] : [{ o, c }];
    });
}

const isRef = (n: string): boolean => n === "REF";
const isCit = (n: string): boolean => n.startsWith("CIT ");
const isQuo = (n: string): boolean => n.startsWith("QUO ");

function pickPair(
  pairs: readonly Pair[],
  f: (p: Pair) => SemanticTamper,
): Arbitrary<SemanticTamper> | undefined {
  return pairs.length === 0 ? undefined : fc.constantFrom(...pairs).map(f);
}

/** Remove a `[REF]` pair: the Extractor range has no Code. */
export const refMissing: Builder = (c) =>
  pickPair(pairsOf(c.s, isRef, "/REF"), ({ o, c: close }) =>
    tamper(
      "ref_missing",
      "extractor_mismatch",
      0,
      applyEdits(c.s.rendering, [replaceCode(o, ""), replaceCode(close, "")]),
    ),
  );

/** Cuts strictly inside the range of `p` (different start offset, different end offset). */
const inside = (s: Scanned, p: Pair): readonly Cut[] =>
  usableCuts(s).filter(
    (k) =>
      k.index >= p.o.end && k.index <= p.c.start && k.offset > p.o.offset && k.offset < p.c.offset,
  );

/** Move a `[REF]` opening Code inward: the Extractor range is then missing. */
export const refMoved: Builder = (c) => {
  const options = pairsOf(c.s, isRef, "/REF").flatMap((p) => inside(c.s, p).map((k) => ({ p, k })));
  if (options.length === 0) return undefined;
  return fc
    .constantFrom(...options)
    .map(({ p, k }) =>
      tamper(
        "ref_moved",
        "extractor_mismatch",
        0,
        applyEdits(c.s.rendering, [replaceCode(p.o, ""), insertEdit(k.index, p.o.text)]),
      ),
    );
};

/** Move a `[/CIT]` inward: the Extractor range is missing from the Codes. */
export const citShifted: Builder = (c) => {
  const options = pairsOf(c.s, isCit, "/CIT").flatMap((p) => inside(c.s, p).map((k) => ({ p, k })));
  if (options.length === 0) return undefined;
  return fc
    .constantFrom(...options)
    .map(({ p, k }) =>
      tamper(
        "cit_shifted",
        "extractor_mismatch",
        0,
        applyEdits(c.s.rendering, [replaceCode(p.c, ""), insertEdit(k.index, p.c.text)]),
      ),
    );
};

/** Remove a `[QUO …]` pair (and its `[OVR]`) from an attached quote. */
export const quoRemoved: Builder = (c) =>
  pickPair(pairsOf(c.s, isQuo, "/QUO"), ({ o, c: close }) => {
    const ovr = c.s.codes.find((x) => x.name === "OVR" && x.start === o.end);
    const open = { start: o.start, end: ovr?.end ?? o.end, text: "" };
    return tamper(
      "quo_removed",
      "extractor_mismatch",
      0,
      applyEdits(c.s.rendering, [open, replaceCode(close, "")]),
    );
  });

type Family = Readonly<{
  isMember: (name: string) => boolean;
  open: (n: number) => string;
  close: string;
}>;

const REF_FAMILY: Family = {
  isMember: (n) => n === "REF" || n === "/REF",
  open: () => "[REF]",
  close: "[/REF]",
};

const QUO_FAMILY: Family = {
  isMember: (n) => isQuo(n) || n === "/QUO",
  open: (n) => `[QUO …{k=k${String(n)}}]`,
  close: "[/QUO]",
};

/**
 * An extra pair of the family around a text range that holds no Code of the
 * same family, so the pair nests or stands alone and its own Code is the one
 * reported. For quotes the counter is raised first and the new key is the
 * old counter, so `issue_key` does not fire before the Extractor check.
 */
function extraPair(
  c: TamperCtx,
  fam: Family,
  kind: "ref_extra" | "quo_extra",
): ReturnType<Builder> {
  const bumped = kind === "quo_extra" ? withCounter(c.s, (n) => n + 1) : undefined;
  if (kind === "quo_extra" && bumped === undefined) return undefined;
  const s = bumped === undefined ? c.s : scanRendering(bumped.text);
  const cuts = usableCuts(s);
  const starts = s.codes.filter((x) => fam.isMember(x.name)).map((x) => x.start);
  const reach = (k: Cut): number => starts.find((st) => st >= k.index) ?? Infinity;
  const ends = (k: Cut): readonly Cut[] =>
    cuts.filter((e) => e.offset > k.offset && e.index <= reach(k));
  const first = cuts.filter((k) => {
    const next = cuts.find((e) => e.offset > k.offset);
    return next !== undefined && next.index <= reach(k);
  });
  if (first.length === 0) return undefined;
  return fc
    .constantFrom(...first)
    .chain((k1) =>
      fc
        .constantFrom(...ends(k1))
        .map((k2) =>
          tamper(
            kind,
            "extractor_mismatch",
            k1.index,
            applyEdits(s.rendering, [
              insertEdit(k2.index, fam.close),
              insertEdit(k1.index, fam.open(bumped?.n ?? 0)),
            ]),
          ),
        ),
    );
}

export const refExtra: Builder = (c) => extraPair(c, REF_FAMILY, "ref_extra");

export const quoExtra: Builder = (c) => extraPair(c, QUO_FAMILY, "quo_extra");
