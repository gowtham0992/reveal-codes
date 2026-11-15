import type { FetchInit, FetchLike } from "../../src/deps";
import {
  RECORD_LINES,
  recordLookups,
  type MainIo,
  type ReportRow,
} from "../../scripts/record-lookups";

export const TOKEN = "sekrit-token-9f8e7d";

export type Live = Readonly<{ status: number; id?: number; name?: string }>;

/** What CourtListener returns today for the seven lines, per the Expected_Outcomes. */
export const LIVE: Readonly<Record<string, Live>> = {
  "556 U.S. 662": { status: 200, id: 145875, name: "Ashcroft v. Iqbal" },
  "925 F.3d 1339": { status: 404 },
  "905 F. Supp. 2d 121": { status: 200, id: 2661490, name: "Some Other v. Matter" },
  "174 F.3d 366": { status: 200, id: 3011108, name: "Unrelated Parties v. Elsewhere" },
  "516 F.3d 1237": { status: 404 },
  "516 U.S. 217": { status: 200, id: 117990, name: "Zicherman v. Korean Air Lines Co." },
  "501 U.S. 32": { status: 200, id: 112616, name: "Chambers v. NASCO, Inc." },
};

export function liveEntries(live: Readonly<Record<string, Live>>): unknown[] {
  let offset = 0;
  return RECORD_LINES.map((line) => {
    const l = live[line] ?? { status: 404 };
    const start = offset;
    offset += line.length + 1;
    const clusters =
      l.id === undefined
        ? []
        : [
            {
              id: l.id,
              absolute_url: `/opinion/${String(l.id)}/x/`,
              case_name: l.name,
              date_filed: "2001-02-03",
              sub_opinions: ["https://example.test/dropped/"],
            },
          ];
    return {
      citation: line,
      normalized_citations: [line],
      start_index: start,
      end_index: start + line.length,
      status: l.status,
      error_message: "",
      clusters,
    };
  });
}

export type Call = Readonly<{ url: string; init: FetchInit }>;

export function fakeFetch(body: unknown, status = 200): { fetch: FetchLike; calls: Call[] } {
  const calls: Call[] = [];
  const fetch: FetchLike = (url, init) => {
    calls.push({ url, init });
    return Promise.resolve({
      status,
      headers: { get: () => null },
      text: () => Promise.resolve(JSON.stringify(body)),
    });
  };
  return { fetch, calls };
}

export type Harness = {
  io: MainIo;
  calls: Call[];
  out: string[];
  err: string[];
  written: Map<string, string>;
};

export function harness(
  env: Record<string, string | undefined>,
  body: unknown,
  existing: (line: string) => unknown = () => undefined,
): Harness {
  const { fetch, calls } = fakeFetch(body);
  const out: string[] = [];
  const err: string[] = [];
  const written = new Map<string, string>();
  const io: MainIo = {
    env,
    fetch,
    readExisting: existing,
    writeFixture: (slug, text) => {
      written.set(slug, text);
    },
    print: (t) => out.push(t),
    printError: (t) => err.push(t),
  };
  return { io, calls, out, err, written };
}

export function rowsFor(live: Readonly<Record<string, Live>>): Promise<readonly ReportRow[]> {
  const { fetch } = fakeFetch(liveEntries(live));
  return recordLookups({
    fetch,
    token: TOKEN,
    baseUrl: "https://cl.test/api",
    lines: RECORD_LINES,
    existing: () => undefined,
  }).then((r) => r.map((x) => x.report));
}
