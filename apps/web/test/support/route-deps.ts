import { readFileSync } from "node:fs";
import { createDocument } from "@reveal-codes/engine";
import type { FullRecord } from "../../src/server/verify-route";
import type { FetchInit, FetchLike, HttpResponse } from "@reveal-codes/verifier";
import { buildServerDeps, readServerConfig, realSleep } from "../../src/server/deps";

export const SENTINEL = "SENTINEL-TOKEN-do-not-leak-7f3a";
const NOW = "2026-11-07T00:00:00.000Z";

export type FetchCall = Readonly<{ url: string; init: FetchInit }>;

/** Real timer sleep, as production: an instant sleep would lose every timeout race. */
function ioWith(fetchLike: FetchLike) {
  return { fetch: fetchLike, now: () => new Date(NOW), sleep: realSleep, homeDir: "/nonexistent" };
}

const REFUSED: HttpResponse = {
  status: 503,
  headers: { get: () => null },
  text: () => Promise.resolve(""),
};

export function fixturesDeps() {
  const config = readServerConfig({
    COURTLISTENER_TOKEN: SENTINEL,
    REVEAL_CODES_FIXTURES_ONLY: "1",
  });
  return buildServerDeps(
    config,
    ioWith(() => Promise.resolve(REFUSED)),
  );
}

/** Live-mode deps over a recording fetch: a rejected request must leave `calls` empty. */
export function recordingLiveDeps() {
  const calls: FetchCall[] = [];
  const config = readServerConfig({
    COURTLISTENER_TOKEN: SENTINEL,
    REVEAL_CODES_CACHE_DIR: "/nonexistent/rc",
  });
  const deps = buildServerDeps(
    config,
    ioWith((url, init) => {
      calls.push({ url, init });
      return Promise.resolve(REFUSED);
    }),
  );
  return { deps, calls };
}

export function demoRecords(): readonly FullRecord[] {
  const text = readFileSync(
    new URL("../../../../packages/engine/fixtures/demo-motion.txt", import.meta.url),
    "utf8",
  );
  const doc = createDocument(text, NOW);
  if (!doc.ok) throw new Error("createDocument failed");
  return doc.value.citations.filter((c): c is FullRecord => c.kind === "full");
}

export function postJson(body: string): Request {
  return new Request("http://localhost/api/verify", { method: "POST", body });
}
