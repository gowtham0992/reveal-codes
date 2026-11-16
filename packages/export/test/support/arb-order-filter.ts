import * as fc from "fast-check";
import { ORDER_KINDS, ORDER_STATUSES } from "../../src/orders-types.js";
import type { OrderEntry } from "../../src/orders-types.js";
import type { FilterState, KindChoice } from "../../src/order-filter.js";

const COURT_NAMES = [
  "Supreme Court of the United States",
  "United States Court of Appeals for the Fifth Circuit",
  "United States District Court for the Northern District of Texas",
  "Court of International Trade",
  "Tribunal de Première Instance",
];
const ABBREVIATIONS = ["U.S.", "5th Cir.", "N.D. Tex.", "C.I.T.", "10th Cir. BAP"];
const JUDGES = ["Hon. Brantley Starr", "Judge O'Neil-Smith", "Zoë Ñandú", "J. R. Fox"];

/** Characters that normalisation removes; used to build spacing and punctuation variants. */
const NOISE = [" ", ".", ",", "-", "'", "  ", " . "];
/** Letters (CJK) that appear in no pool string, so a query made of them matches nothing. */
const ABSENT = ["漢", "字", "語"];

const arbJudge = fc.oneof(
  { weight: 1, arbitrary: fc.constant(null) },
  {
    weight: 2,
    arbitrary: fc.constantFrom(...JUDGES).map((name) => ({ name, role: "judge" })),
  },
);

function entryAt(
  index: number,
  parts: Readonly<{
    court: string;
    abbreviation: string;
    judge: { name: string; role: string } | null;
    kind: OrderEntry["kind"];
    status: OrderEntry["status"];
  }>,
): OrderEntry {
  return {
    id: `order-${String(index)}`,
    court: { name: parts.court, abbreviation: parts.abbreviation, level: "federal" },
    judge: parts.judge,
    instrument: "standing order",
    title: "Title",
    date: "2025-01-01",
    kind: parts.kind,
    applies_to: "all",
    elements: [],
    caption: null,
    key_language: "text",
    source_url: "https://example.org/order",
    source_kind: "court",
    retrieved: "2025-01-02",
    status: parts.status,
  };
}

/** Lists of instruments with unique ids and small name pools, so matches are common. */
export const arbOrderEntries: fc.Arbitrary<readonly OrderEntry[]> = fc
  .array(
    fc.record({
      court: fc.constantFrom(...COURT_NAMES),
      abbreviation: fc.constantFrom(...ABBREVIATIONS),
      judge: arbJudge,
      kind: fc.constantFrom(...ORDER_KINDS),
      status: fc.constantFrom(...ORDER_STATUSES),
    }),
    { maxLength: 12 },
  )
  .map((list) => list.map((parts, index) => entryAt(index, parts)));

const arbKind: fc.Arbitrary<KindChoice> = fc.oneof(
  { weight: 2, arbitrary: fc.constant<KindChoice>("all") },
  { weight: 3, arbitrary: fc.constantFrom<KindChoice>(...ORDER_KINDS) },
);

const arbNoiseQuery = fc.constantFrom("", " ", "   ", ".", "...", " - ", "'", ", .");
const arbAbsentQuery = fc
  .array(fc.constantFrom(...ABSENT), { minLength: 1, maxLength: 4 })
  .map((chars) => chars.join(""));

function fieldsOf(entries: readonly OrderEntry[]): readonly string[] {
  return entries.flatMap((e) => [
    e.court.name,
    e.court.abbreviation,
    ...(e.judge === null ? [] : [e.judge.name]),
  ]);
}

/** A slice of one field, optionally recased and with noise characters inserted between its characters. */
function arbDerivedQuery(fields: readonly string[], disguise: boolean): fc.Arbitrary<string> {
  return fc
    .tuple(
      fc.constantFrom(...fields),
      fc.nat(60),
      fc.nat(60),
      fc.array(fc.boolean(), { maxLength: 80 }),
      fc.array(fc.option(fc.constantFrom(...NOISE), { nil: undefined }), { maxLength: 80 }),
    )
    .map(([field, a, b, upper, noise]) => {
      const start = a % (field.length + 1);
      const chars = Array.from(field.slice(start, start + (b % (field.length + 1))));
      if (!disguise) return chars.join("");
      return chars
        .map(
          (ch, i) => (upper[i] === true ? ch.toUpperCase() : ch.toLowerCase()) + (noise[i] ?? ""),
        )
        .join("");
    });
}

function arbQuery(entries: readonly OrderEntry[]): fc.Arbitrary<string> {
  const fields = fieldsOf(entries);
  const noMatch = { weight: 1, arbitrary: arbAbsentQuery };
  const noise = { weight: 1, arbitrary: arbNoiseQuery };
  if (fields.length === 0) return fc.oneof(noMatch, noise);
  return fc.oneof(
    { weight: 3, arbitrary: arbDerivedQuery(fields, false) },
    { weight: 3, arbitrary: arbDerivedQuery(fields, true) },
    noMatch,
    noise,
  );
}

const CLEARED: FilterState = { query: "", kind: "all", showInactive: false };

/** Filter states for `entries`: the cleared state is weighted, the rest are built from the entries' own text. */
export function arbFilterState(entries: readonly OrderEntry[]): fc.Arbitrary<FilterState> {
  return fc.oneof(
    { weight: 3, arbitrary: fc.constant(CLEARED) },
    {
      weight: 7,
      arbitrary: fc.record({
        query: arbQuery(entries),
        kind: arbKind,
        showInactive: fc.boolean(),
      }),
    },
  );
}
