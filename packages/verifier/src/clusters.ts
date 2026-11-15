import { asArray, isRecord } from "./json";

/** The display data of the one cluster a lookup entry resolved to. Each field is present only when the response had it as a string. */
export type ClusterData = Readonly<{
  caseName?: string;
  caseNameFull?: string;
  caseNameShort?: string;
  dateFiled?: string;
  absoluteUrl?: string;
}>;

function idOf(v: unknown): string | null {
  if (typeof v === "number") return Number.isSafeInteger(v) && v > 0 ? String(v) : null;
  return typeof v === "string" && /^[1-9][0-9]*$/.test(v) ? v : null;
}

const FIELDS: readonly (readonly [keyof ClusterData, string])[] = [
  ["caseName", "case_name"],
  ["caseNameFull", "case_name_full"],
  ["caseNameShort", "case_name_short"],
  ["dateFiled", "date_filed"],
  ["absoluteUrl", "absolute_url"],
];

function dataOf(cluster: Readonly<Record<string, unknown>>): ClusterData {
  const out: { -readonly [K in keyof ClusterData]: string } = {};
  for (const [field, key] of FIELDS) {
    const v = cluster[key];
    if (typeof v === "string") out[field] = v;
  }
  return out;
}

function entryData(entry: unknown): ClusterData | null {
  if (!isRecord(entry) || entry["status"] !== 200) return null;
  const clusters = (asArray(entry["clusters"]) ?? []).filter(isRecord);
  const ids = new Set<string>();
  for (const c of clusters) {
    const id = idOf(c["id"]);
    if (id !== null) ids.add(id);
  }
  if (ids.size !== 1) return null;
  const first = clusters.find((c) => idOf(c["id"]) !== null);
  return first === undefined ? null : dataOf(first);
}

/** Entry index to the data of its one cluster; only entries with status 200 and exactly one distinct cluster id. */
export function clusterDataByIndex(body: unknown): ReadonlyMap<number, ClusterData> {
  const out = new Map<number, ClusterData>();
  (asArray(body) ?? []).forEach((entry, i) => {
    const data = entryData(entry);
    if (data !== null) out.set(i, data);
  });
  return out;
}

/** Non-blank `case_name`, `case_name_full`, `case_name_short`, in that order, without duplicates. */
export function foundNames(c: ClusterData): readonly string[] {
  const all = [c.caseName, c.caseNameFull, c.caseNameShort];
  const names = all.filter((s): s is string => typeof s === "string" && s.trim() !== "");
  return [...new Set(names)];
}

/** The integer of the first four characters of `date_filed` when they are digits and at least 1000. */
export function foundYear(c: ClusterData): number | undefined {
  const head = c.dateFiled?.slice(0, 4);
  if (head === undefined || !/^[0-9]{4}$/.test(head)) return undefined;
  const year = Number(head);
  return year >= 1000 ? year : undefined;
}
