import { createApiClient } from "../../src/client/api";
import type { ApiClient, FetchFn } from "../../src/client/api";
import { readServerConfig } from "../../src/server/deps";
import { handleAssistant } from "../../src/server/assistant-route";
import { handleMode } from "../../src/server/mode-route";
import { routeFetch } from "./route-fetch";

export type AssistantFetch = Readonly<{
  api: ApiClient;
  /** Request bodies sent to `/api/assistant`, in order. */
  bodies: string[];
  /** While set, each reply pauses after its first chunk until the gate resolves. */
  gate: { current: Promise<void> | null };
  /** When set, `/api/assistant` answers with this instead of the real route handler. */
  override: { current: (() => Response) | null };
}>;

const NO_PROVIDER = { bedrock: null, anthropic: null } as const;

/** Passes the first chunk through, waits for the gate or an abort, then passes the rest. */
function gated(res: Response, gate: Promise<void>, signal: AbortSignal | undefined): Response {
  const source = (res.body as ReadableStream<Uint8Array>).getReader();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      const aborted = new Promise<void>((resolve) => {
        signal?.addEventListener("abort", () => {
          resolve();
        });
      });
      void (async () => {
        for (let n = 0; ; n++) {
          const step = await source.read();
          if (signal?.aborted === true) {
            controller.error(new Error("aborted"));
            return;
          }
          if (step.done) {
            controller.close();
            return;
          }
          controller.enqueue(step.value);
          if (n === 0) await Promise.race([gate, aborted]);
        }
      })();
    },
  });
  return new Response(body, { status: res.status, headers: res.headers });
}

/** An in-process server: the real mode and assistant handlers over the fixture provider. */
export function assistantFetch(): AssistantFetch {
  const routes = routeFetch();
  const bodies: string[] = [];
  const gate: AssistantFetch["gate"] = { current: null };
  const override: AssistantFetch["override"] = { current: null };
  const config = readServerConfig({ REVEAL_CODES_FIXTURES_ONLY: "1" });
  const fetchFn: FetchFn = async (input, init) => {
    if (input === "/api/mode") return handleMode(config);
    if (input !== "/api/assistant") return routes.fetch(input, init);
    bodies.push(init?.body ?? "");
    if (override.current !== null) return override.current();
    const request = new Request("http://localhost/api/assistant", {
      method: "POST",
      body: init?.body ?? "",
    });
    const res = await handleAssistant(request, NO_PROVIDER);
    return gate.current === null || !res.ok ? res : gated(res, gate.current, init?.signal);
  };
  return { api: createApiClient(fetchFn), bodies, gate, override };
}
