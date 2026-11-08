import { describe, expect, it } from "vitest";
import { handleOpinion } from "../src/server/opinion-route";
import { fixturesDeps, recordingLiveDeps, SENTINEL } from "./support/route-deps";

describe("GET /api/opinion/<clusterId> _Requirements: 16.4, 16.5_", () => {
  const badIds = ["0", "01", "1234567890123", "abc", "12a", "", "-1", "1.5", " 1"];
  for (const id of badIds) {
    it(`id ${JSON.stringify(id)} gives 400 without fetching`, async () => {
      const { deps, calls } = recordingLiveDeps();
      const res = await handleOpinion(id, deps);
      expect(res.status).toBe(400);
      expect(res.headers.get("Cache-Control")).toBe("no-store");
      expect(calls).toHaveLength(0);
      expect(await res.text()).not.toContain(SENTINEL);
    });
  }

  it("returns the recorded opinion text", async () => {
    const res = await handleOpinion("108432", fixturesDeps());
    const text = await res.text();
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(text).not.toContain(SENTINEL);
    const body = JSON.parse(text) as { clusterId: string; text: string | null };
    expect(body.clusterId).toBe("108432");
    expect(typeof body.text).toBe("string");
    expect(body.text?.length).toBeGreaterThan(0);
  });

  it("an unrecorded cluster gives 200 with text null", async () => {
    const res = await handleOpinion("999999999", fixturesDeps());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ clusterId: "999999999", text: null });
  });
});
