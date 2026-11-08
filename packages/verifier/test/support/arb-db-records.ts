import * as fc from "fast-check";
import { format } from "@reveal-codes/engine";
import type { CitationRecord, DatabaseValue } from "@reveal-codes/engine";
// The engine's `testing/` folder is deliberately not exported from its index (engine Req 1.2).
import { arbDatabaseValue } from "../../../engine/src/testing/arb-citation";
import { arbRecords } from "./arb-records";
import type { LookupCase } from "./arb-records";

/** Input of Property 11: records mixed with Database_Citation Full_Records. */
export type DatabaseCase = Readonly<{
  /** The base records with the database records inserted. */
  mixed: LookupCase;
  /** The same case with the database records removed (empty base when `onlyDatabase`). */
  withoutDatabase: LookupCase;
  /** Keys of the inserted database Full_Records. */
  databaseKeys: readonly string[];
  /** Every canonical text of the inserted database citations, with and without pincite. */
  databaseTexts: readonly string[];
  onlyDatabase: boolean;
}>;

type FullRecord = Extract<CitationRecord, { kind: "full" }>;

function databaseRecord(value: DatabaseValue, i: number): FullRecord {
  const text = format(value);
  const rendered = text.ok ? text.value : "";
  return {
    kind: "full",
    key: `k${String(1_000_000 + i)}`,
    citation: { start: 0, end: rendered.length, text: rendered, value },
    result: { status: "unchecked" },
  };
}

function textsOf(value: DatabaseValue): string[] {
  const bare: DatabaseValue = {
    kind: "database",
    year: value.year,
    designator: value.designator,
    number: value.number,
    ...(value.lexisCourtListed === undefined ? {} : { lexisCourtListed: value.lexisCourtListed }),
    ...(value.lexisCourt === undefined ? {} : { lexisCourt: value.lexisCourt }),
  };
  return [format(value), format(bare)].flatMap((r) => (r.ok ? [r.value] : []));
}

function insertAll(
  base: readonly CitationRecord[],
  extra: readonly CitationRecord[],
  at: readonly number[],
): CitationRecord[] {
  const out = [...base];
  extra.forEach((rec, i) => out.splice((at[i] ?? 0) % (out.length + 1), 0, rec));
  return out;
}

export const arbDatabaseCase: fc.Arbitrary<DatabaseCase> = fc
  .record({
    base: arbRecords,
    values: fc.array(arbDatabaseValue, { minLength: 1, maxLength: 5 }),
    at: fc.array(fc.nat(50), { minLength: 5, maxLength: 5 }),
    onlyDatabase: fc.boolean(),
    token: fc.option(fc.stringMatching(/^[0-9a-f]{8,16}$/), { nil: undefined }),
  })
  .map(({ base, values, at, onlyDatabase, token }) => {
    const kept = onlyDatabase ? [] : base;
    const dbs = values.map(databaseRecord);
    return {
      mixed: { records: insertAll(kept, dbs, at), draft: "", token },
      withoutDatabase: { records: kept, draft: "", token },
      databaseKeys: dbs.map((r) => r.key),
      databaseTexts: values.flatMap(textsOf),
      onlyDatabase,
    };
  });
