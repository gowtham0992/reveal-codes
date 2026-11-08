import { createApiClient } from "../../src/client/api";
import type { ApiClient, FetchFn } from "../../src/client/api";
import { readServerConfig } from "../../src/server/deps";
import { handleMode } from "../../src/server/mode-route";
import { routeFetch } from "./route-fetch";
import type { RouteFetch } from "./route-fetch";

export type ModeSetting = "fixtures" | "live" | "down";

export type ModeApi = Readonly<{
  api: ApiClient;
  routes: RouteFetch;
  /** While set, `/api/verify` waits for it; lets a test observe the running state. */
  gate: { current: Promise<void> | null };
}>;

const LIVE_ENV = { COURTLISTENER_TOKEN: "test-token-not-real" };

/** An Api client over the real route handlers, with `/api/mode` answering `setting`. */
export function modeApi(setting: ModeSetting): ModeApi {
  const routes = routeFetch();
  const gate: ModeApi["gate"] = { current: null };
  const fetchFn: FetchFn = async (input, init) => {
    if (input === "/api/mode") {
      if (setting === "down") return new Response("unavailable", { status: 503 });
      const env = setting === "live" ? LIVE_ENV : { REVEAL_CODES_FIXTURES_ONLY: "1" };
      return handleMode(readServerConfig(env));
    }
    if (input === "/api/verify" && gate.current !== null) await gate.current;
    return routes.fetch(input, init);
  };
  return { api: createApiClient(fetchFn), routes, gate };
}
