import { describe, expect, it } from "vitest";
import { readServerConfig } from "../src/server/deps";
import { handleMode } from "../src/server/mode-route";
import { SENTINEL } from "./support/route-deps";
import * as verifyRoute from "../app/api/verify/route";
import * as opinionRoute from "../app/api/opinion/[clusterId]/route";
import * as modeRoute from "../app/api/mode/route";

describe("GET /api/mode _Requirements: 15.6, 16.6_", () => {
  it("reports fixtures", async () => {
    const res = handleMode(readServerConfig({}));
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(await res.json()).toEqual({ mode: "fixtures" });
  });

  it("reports live and never the token, paths or base URL", async () => {
    const config = readServerConfig({
      COURTLISTENER_TOKEN: SENTINEL,
      REVEAL_CODES_CACHE_DIR: "/tmp/rc-secret-dir",
    });
    const res = handleMode(config);
    const text = await res.text();
    expect(JSON.parse(text)).toEqual({ mode: "live" });
    expect(text).not.toContain(SENTINEL);
    expect(text).not.toContain("rc-secret-dir");
  });
});

describe("route files: runtime and method guards _Requirements: 16.6, 16.7_", () => {
  const routes = [
    ["verify", verifyRoute, "POST", ["GET", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]],
    ["opinion", opinionRoute, "GET", ["POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]],
    ["mode", modeRoute, "GET", ["POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]],
  ] as const;
  for (const [name, mod, allow, others] of routes) {
    it(`${name}: nodejs, dynamic, and 405 with Allow ${allow} and no-store`, () => {
      expect(mod.runtime).toBe("nodejs");
      expect(mod.dynamic).toBe("force-dynamic");
      const exported = mod as unknown as Record<string, () => Response>;
      for (const method of others) {
        const handler = exported[method];
        expect(handler, method).toBeTypeOf("function");
        const res = handler?.();
        expect(res?.status).toBe(405);
        expect(res?.headers.get("Allow")).toBe(allow);
        expect(res?.headers.get("Cache-Control")).toBe("no-store");
      }
    });
  }
});
