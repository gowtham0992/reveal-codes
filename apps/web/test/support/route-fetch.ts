import { readFileSync } from "node:fs";
import { handleOpinion } from "../../src/server/opinion-route";
import { handleVerify } from "../../src/server/verify-route";
import type { FetchFn } from "../../src/client/api";
import { fixturesDeps } from "./route-deps";

export type RecordedRequest = Readonly<{ url: string; method: string; body: string | null }>;

export type RouteFetch = Readonly<{
  fetch: FetchFn;
  requests: RecordedRequest[];
  /** Runs before each response is returned; lets a test act mid-flow. */
  onRequest: { current: ((request: RecordedRequest) => void) | null };
}>;

const OPINION = /^\/api\/opinion\/([^/]+)$/;

/** An in-process fake server: the real route handlers over recorded fixtures. */
export function routeFetch(): RouteFetch {
  const deps = fixturesDeps();
  const requests: RecordedRequest[] = [];
  const onRequest: RouteFetch["onRequest"] = { current: null };
  const fetchFn: FetchFn = async (input, init) => {
    const recorded = { url: input, method: init?.method ?? "GET", body: init?.body ?? null };
    requests.push(recorded);
    onRequest.current?.(recorded);
    const opinion = OPINION.exec(input);
    if (input === "/api/verify") {
      return handleVerify(
        new Request("http://localhost/api/verify", { method: "POST", body: init?.body ?? "" }),
        deps,
      );
    }
    if (opinion?.[1] !== undefined) return handleOpinion(decodeURIComponent(opinion[1]), deps);
    if (input === "/demo-motion.txt") {
      const url = new URL("../../../../packages/engine/fixtures/demo-motion.txt", import.meta.url);
      return new Response(readFileSync(url, "utf8"));
    }
    return new Response("not found", { status: 404 });
  };
  return { fetch: fetchFn, requests, onRequest };
}
