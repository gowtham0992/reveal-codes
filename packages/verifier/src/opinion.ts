import { cacheGet, cacheSet, isOpinionText } from "./cache-access";
import type { Deps } from "./deps";
import { htmlToText } from "./html";
import { isRecord } from "./json";
import { authHeaders } from "./request";
import { requestOnce, withRetries } from "./transport";

/** Opinion_Text_Fields in order of preference (Req 9.3). */
export const OPINION_FIELDS = [
  "plain_text",
  "html_with_citations",
  "html",
  "html_lawbox",
  "html_columbia",
  "xml_harvard",
] as const;

const CLUSTER_ID = /^[1-9][0-9]*$/;
const OPINION_TAIL = /\/opinions\/([0-9]+)\/?(?:\?.*)?$/;

/** Opinion and cluster requests are not metered by the Token_Bucket (design). */
const ALWAYS: () => Promise<boolean> = () => Promise.resolve(true);

async function getJson(deps: Deps, url: string): Promise<Readonly<Record<string, unknown>> | null> {
  const headers = authHeaders(deps, url, { Accept: "application/json" });
  const { outcome } = await withRetries(deps, ALWAYS, () =>
    requestOnce(deps, url, { method: "GET", headers }),
  );
  return outcome.kind === "json" && isRecord(outcome.json) ? outcome.json : null;
}

function opinionIds(cluster: Readonly<Record<string, unknown>>): readonly string[] {
  const subs = cluster["sub_opinions"];
  if (!Array.isArray(subs)) return [];
  const ids: string[] = [];
  for (const u of subs as readonly unknown[]) {
    const m = typeof u === "string" ? OPINION_TAIL.exec(u) : null;
    if (m?.[1] !== undefined) ids.push(m[1]);
  }
  return ids;
}

/** The first non-empty field in preference order, stripped when not `plain_text`. */
function firstNonEmptyField(opinion: Readonly<Record<string, unknown>>): string | null {
  for (const field of OPINION_FIELDS) {
    const raw = opinion[field];
    if (typeof raw !== "string" || raw.trim() === "") continue;
    const text = field === "plain_text" ? raw : htmlToText(raw);
    if (text.trim() !== "") return text;
  }
  return null;
}

const OPINION_FIELD_LIST = ["id", ...OPINION_FIELDS].join(",");

/**
 * The text of the first opinion in the cluster that has any, or `null`. Never throws;
 * any failure returns `null` and caches nothing (Req 9.8). Opinion URLs are rebuilt
 * from `Deps.baseUrl` and the numeric tail, so the token goes nowhere else.
 */
export async function fetchOpinionText(clusterId: string, deps: Deps): Promise<string | null> {
  if (!CLUSTER_ID.test(clusterId)) return null;
  const key = `opinion:${clusterId}`;
  const hit = await cacheGet(deps, key, isOpinionText);
  if (hit !== undefined) return hit;
  const cluster = await getJson(
    deps,
    `${deps.baseUrl}/clusters/${clusterId}/?fields=id,sub_opinions`,
  );
  if (cluster === null) return null;
  for (const oid of opinionIds(cluster)) {
    const opinion = await getJson(
      deps,
      `${deps.baseUrl}/opinions/${oid}/?fields=${OPINION_FIELD_LIST}`,
    );
    if (opinion === null) return null;
    const text = firstNonEmptyField(opinion);
    if (text !== null) {
      await cacheSet(deps, key, text);
      return text;
    }
  }
  return null;
}
