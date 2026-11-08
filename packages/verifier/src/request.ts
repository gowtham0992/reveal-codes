import type { Deps } from "./deps";

/** What a request needs besides the URL; `transport.ts` adds `signal` and `redirect`. */
export type RequestSpec = Readonly<{
  method: "GET" | "POST";
  headers: Readonly<Record<string, string>>;
  body?: string;
}>;

export type LookupRequest = Readonly<{ url: string; spec: RequestSpec }>;

/**
 * Adds `Authorization: Token <token>` only when a token is configured and the
 * URL starts with `{baseUrl}/` (Req 2.9, 2.10). The only place a token is read.
 */
export function authHeaders(
  deps: Pick<Deps, "baseUrl" | "token">,
  url: string,
  headers: Readonly<Record<string, string>>,
): Readonly<Record<string, string>> {
  const token = deps.token;
  if (token === undefined || token === "" || !url.startsWith(`${deps.baseUrl}/`)) return headers;
  return { ...headers, Authorization: `Token ${token}` };
}

/**
 * The citation-lookup request for one chunk. Takes lines, not records, so a
 * draft cannot reach it (Req 2.1, 2.2). The token is added by `authHeaders`.
 */
export function buildLookupRequest(
  deps: Pick<Deps, "baseUrl" | "token">,
  lines: readonly string[],
): LookupRequest {
  const url = `${deps.baseUrl}/citation-lookup/`;
  const headers = authHeaders(deps, url, {
    "Content-Type": "application/x-www-form-urlencoded",
    Accept: "application/json",
  });
  return {
    url,
    spec: { method: "POST", headers, body: `text=${encodeURIComponent(lines.join("\n"))}` },
  };
}
