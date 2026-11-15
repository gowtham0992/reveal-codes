import * as fc from "fast-check";
import { EXPECTED } from "../../scripts/record-expected";
import { RECORD_LINES, main } from "../../scripts/record-lookups";

// ---- Property 18 harness: the Recording_Script through an injected fetch and an in-memory writer. ----

/** The found names that give the Expected_Outcomes for each recorded line (as in record-lookups.test.ts). */
export const RECORDED_NAMES: Readonly<Record<string, string>> = {
  "556 U.S. 662": "Ashcroft v. Iqbal",
  "905 F. Supp. 2d 121": "Some Other v. Matter",
  "174 F.3d 366": "Unrelated Parties v. Elsewhere",
  "516 U.S. 217": "Zicherman v. Korean Air Lines Co.",
  "501 U.S. 32": "Chambers v. NASCO, Inc.",
};
export const CLUSTER_KEYS = [
  "id",
  "absolute_url",
  "case_name",
  "date_filed",
  "case_name_full",
  "case_name_short",
] as const;

export type RecordedCluster = Readonly<{
  date: string | null;
  full: boolean;
  short: boolean;
}>;
export type RecordingCase = Readonly<{
  token: string;
  headerName: string;
  clusters: readonly RecordedCluster[];
}>;

export const arbRecordedCluster: fc.Arbitrary<RecordedCluster> = fc.record({
  date: fc.option(fc.stringMatching(/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/), { nil: null }),
  full: fc.boolean(),
  short: fc.boolean(),
});
export const arbRecordingCase: fc.Arbitrary<RecordingCase> = fc.record({
  token: fc.stringMatching(/^[A-Za-z0-9]{20,40}$/).map((s) => `zq9-${s}`),
  headerName: fc.stringMatching(/^[a-z0-9]{4,10}$/).map((s) => `x-hdr-${s}`),
  clusters: fc.array(arbRecordedCluster, { minLength: 7, maxLength: 7 }),
});

/** The cluster object the live response holds for `line`, plus fields the script must drop. */
export function liveCluster(
  line: string,
  c: RecordedCluster,
  c0: RecordingCase,
): Record<string, unknown> {
  const want = EXPECTED[line];
  const name = RECORDED_NAMES[line] ?? "";
  const id = Number(want?.clusterId);
  return {
    id,
    absolute_url: `/opinion/${String(id)}/x/`,
    case_name: name,
    ...(c.date === null ? {} : { date_filed: c.date }),
    ...(c.full ? { case_name_full: name } : {}),
    ...(c.short ? { case_name_short: name.split(" ")[0] } : {}),
    Authorization: `Token ${c0.token}`,
    sub_opinions: [c0.token],
    resource_uri: `https://x.test/?key=${c0.token}`,
  };
}

export function liveBody(c0: RecordingCase): unknown[] {
  let offset = 0;
  return RECORD_LINES.map((line, i) => {
    const want = EXPECTED[line];
    const start = offset;
    offset += line.length + 1;
    const found = want?.clusterId !== null && want?.clusterId !== undefined;
    const cluster = c0.clusters[i];
    return {
      citation: line,
      normalized_citations: [line],
      start_index: start,
      end_index: start + line.length,
      status: want?.status,
      error_message: "",
      headers: { Authorization: `Token ${c0.token}` },
      clusters: found && cluster !== undefined ? [liveCluster(line, cluster, c0)] : [],
    };
  });
}

/** Runs `main --write` with the token in env and the token echoed in the response headers. */
export async function recordWith(c0: RecordingCase): Promise<{
  written: Map<string, string>;
  logs: string[];
  code: number;
  sent: string | undefined;
}> {
  const written = new Map<string, string>();
  const logs: string[] = [];
  let sent: string | undefined;
  const body = JSON.stringify(liveBody(c0));
  const code = await main(["--write"], {
    env: { COURTLISTENER_TOKEN: c0.token },
    fetch: (_url, init) => {
      sent = init.headers["Authorization"];
      return Promise.resolve({
        status: 200,
        headers: {
          get: (n: string) => (n.toLowerCase() === c0.headerName ? `Token ${c0.token}` : null),
        },
        text: () => Promise.resolve(body),
      });
    },
    readExisting: () => undefined,
    writeFixture: (slug, text) => {
      written.set(slug, text);
    },
    print: (t) => logs.push(t),
    printError: (t) => logs.push(t),
  });
  return { written, logs, code, sent };
}

export function expectedClusters(c0: RecordingCase): Map<string, Record<string, unknown>> {
  const out = new Map<string, Record<string, unknown>>();
  RECORD_LINES.forEach((line, i) => {
    const cluster = c0.clusters[i];
    const want = EXPECTED[line];
    if (want?.clusterId === null || cluster === undefined) return;
    const live = liveCluster(line, cluster, c0);
    const kept: Record<string, unknown> = {};
    for (const k of CLUSTER_KEYS) if (live[k] !== undefined) kept[k] = live[k];
    out.set(line, kept);
  });
  return out;
}
