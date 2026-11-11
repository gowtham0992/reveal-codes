import { describe, expect, it } from "vitest";
import { readServerConfig } from "../src/server/deps";
import { handleMode } from "../src/server/mode-route";
import { SENTINEL } from "./support/route-deps";
import * as verifyRoute from "../app/api/verify/route";
import * as opinionRoute from "../app/api/opinion/[clusterId]/route";
import * as modeRoute from "../app/api/mode/route";
import * as assistantRoute from "../app/api/assistant/route";

describe("GET /api/mode _Requirements: 15.6, 16.6_", () => {
  it("reports fixtures", async () => {
    const res = handleMode(readServerConfig({}));
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(await res.json()).toEqual({
      mode: "fixtures",
      assistant: { provider: "fixture", modelId: null },
    });
  });

  it("reports live and never the token, paths or base URL", async () => {
    const config = readServerConfig({
      COURTLISTENER_TOKEN: SENTINEL,
      REVEAL_CODES_CACHE_DIR: "/tmp/rc-secret-dir",
    });
    const res = handleMode(config);
    const text = await res.text();
    expect(JSON.parse(text)).toEqual({
      mode: "live",
      assistant: { provider: "fixture", modelId: null },
    });
    expect(text).not.toContain(SENTINEL);
    expect(text).not.toContain("rc-secret-dir");
  });
});

describe("GET /api/mode with BEDROCK_ROLE_ARN", () => {
  const pair = { AWS_REGION: "secret-region-1", BEDROCK_MODEL_ID: "model-b" };
  const ARN = "arn:aws:iam::123456789012:role/SENTINEL-ROLE";
  it("answers exactly as it does without the role and never contains the ARN", async () => {
    const without = await handleMode(readServerConfig(pair)).text();
    const withRole = await handleMode(readServerConfig({ ...pair, BEDROCK_ROLE_ARN: ARN })).text();
    expect(withRole).toBe(without);
    expect(withRole).not.toContain("SENTINEL-ROLE");
  });
});
describe("GET /api/mode assistant field _Requirements: 15.6, 22.2_", () => {
  const cases: ReadonlyArray<readonly [string, Record<string, string>, unknown]> = [
    [
      "Bedrock",
      { AWS_REGION: "secret-region-1", BEDROCK_MODEL_ID: "model-b" },
      { provider: "bedrock", modelId: "model-b" },
    ],
    [
      "Anthropic",
      { ANTHROPIC_API_KEY: "sk-ant-SENTINEL-KEY", ANTHROPIC_MODEL: "model-a" },
      { provider: "anthropic", modelId: "model-a" },
    ],
    [
      "both pairs set: Bedrock wins",
      {
        AWS_REGION: "secret-region-1",
        BEDROCK_MODEL_ID: "model-b",
        ANTHROPIC_API_KEY: "sk-ant-SENTINEL-KEY",
        ANTHROPIC_MODEL: "model-a",
      },
      { provider: "bedrock", modelId: "model-b" },
    ],
    ["Anthropic key without model", { ANTHROPIC_API_KEY: "sk-ant-SENTINEL-KEY" }, null],
  ];
  for (const [name, env, expected] of cases) {
    it(`${name}: provider and model id only, never the key or region`, async () => {
      const text = await handleMode(readServerConfig(env)).text();
      const body = JSON.parse(text) as { assistant: unknown };
      expect(body.assistant).toEqual(expected ?? { provider: "fixture", modelId: null });
      expect(text).not.toContain("SENTINEL-KEY");
      expect(text).not.toContain("secret-region-1");
    });
  }
});

describe("route files: runtime and method guards _Requirements: 16.6, 16.7_", () => {
  const routes = [
    ["assistant", assistantRoute, "POST", ["GET", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]],
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
