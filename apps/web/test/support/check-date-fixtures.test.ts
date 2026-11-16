import { describe, expect, it } from "vitest";
import { needsCheckDate } from "../../src/client/check-date";
import { buildVerifyBody } from "../../src/client/verify-flow";
import { fakeVerifyApi, restoredDemoStore } from "./check-date-fixtures";

describe("needsCheckDate test support _Requirements: 13.1, 13.11, 13.13_", () => {
  it("builds a restored Store with no check date that needs one", async () => {
    const state = (await restoredDemoStore()).getState();
    expect(state.verifiedAt).toBeNull();
    expect(state.runLog).toEqual([]);
    expect(needsCheckDate(state.document, state.verifiedAt)).toBe(true);
  });

  it("answers each record it is given", async () => {
    const { document } = (await restoredDemoStore()).getState();
    const { records } = buildVerifyBody(document);
    expect(records.length).toBeGreaterThan(0);
    const fake = fakeVerifyApi();
    const reply = await fake.api.verify(records);
    if (!reply.ok) throw new Error("fake verify failed");
    expect(reply.value.pairs.map(([key]) => key)).toEqual(records.map((r) => r.key));
    expect(reply.value.pairs.every(([, r]) => r.status === "verified")).toBe(true);
    expect(fake.seen).toEqual(records);
  });
});
