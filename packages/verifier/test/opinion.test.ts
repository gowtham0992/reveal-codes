import { describe, expect, it } from "vitest";
import { fetchOpinionText } from "../src/opinion";
import { makeDeps, TEST_BASE_URL } from "./support/make-deps";
import type { ScriptStep } from "./support/scripted-fetch";

const cluster = (...ids: number[]): ScriptStep => ({
  status: 200,
  body: { id: 7, sub_opinions: ids.map((i) => `${TEST_BASE_URL}/opinions/${String(i)}/`) },
});
const opinion = (body: Record<string, unknown>): ScriptStep => ({ status: 200, body });

describe("fetchOpinionText", () => {
  it("prefers plain_text and caches the result (Req 9.9, 9.10)", async () => {
    const t = makeDeps([cluster(1), opinion({ plain_text: "plain", html: "<p>html</p>" })]);
    expect(await fetchOpinionText("7", t.deps)).toBe("plain");
    expect(await fetchOpinionText("7", t.deps)).toBe("plain");
    expect(t.fetch.calls).toHaveLength(2);
    expect(t.fetch.calls[0]?.url).toBe(`${TEST_BASE_URL}/clusters/7/?fields=id,sub_opinions`);
  });

  it("falls back to a stripped html field", async () => {
    const t = makeDeps([cluster(1), opinion({ plain_text: "  ", html: "<p>a &amp; b</p>" })]);
    expect(await fetchOpinionText("7", t.deps)).toBe("\na & b\n");
  });

  it("skips a markup-only field", async () => {
    const t = makeDeps([
      cluster(1),
      opinion({ html_with_citations: "<p> </p>", html: "<i>text</i>" }),
    ]);
    expect(await fetchOpinionText("7", t.deps)).toBe("text");
  });

  it("returns a later opinion's text when an earlier one is empty (Req 9.4)", async () => {
    const t = makeDeps([
      cluster(1, 2),
      opinion({ plain_text: null }),
      opinion({ plain_text: "later" }),
    ]);
    expect(await fetchOpinionText("7", t.deps)).toBe("later");
  });

  it("returns the earlier opinion's lower-preference field (Req 9.5)", async () => {
    const t = makeDeps([cluster(1, 2), opinion({ xml_harvard: "<p>early</p>" })]);
    expect(await fetchOpinionText("7", t.deps)).toBe("\nearly\n");
    expect(t.fetch.calls).toHaveLength(2);
  });

  it("returns null and caches nothing for zero opinions or no text (Req 9.7)", async () => {
    const t = makeDeps([cluster(), cluster(1), opinion({})]);
    expect(await fetchOpinionText("7", t.deps)).toBeNull();
    expect(await fetchOpinionText("7", t.deps)).toBeNull();
    expect(await t.cache.get("opinion:7")).toBeUndefined();
  });

  it("returns null without caching when a request fails (Req 9.8)", async () => {
    const t = makeDeps([cluster(1), { status: 404, body: { detail: "no" } }]);
    expect(await fetchOpinionText("7", t.deps)).toBeNull();
    expect(await t.cache.get("opinion:7")).toBeUndefined();
  });

  it("rejects a malformed cluster id without calling fetch", async () => {
    const t = makeDeps([]);
    expect(await fetchOpinionText("0", t.deps)).toBeNull();
    expect(await fetchOpinionText("../x", t.deps)).toBeNull();
    expect(t.fetch.calls).toHaveLength(0);
  });

  it("never sends the token to a host named by sub_opinions (Req 2.9, 2.10)", async () => {
    const t = makeDeps(
      [
        { status: 200, body: { sub_opinions: ["https://evil.test/api/rest/v4/opinions/9/"] } },
        opinion({ plain_text: "ok" }),
      ],
      { token: "SECRET" },
    );
    expect(await fetchOpinionText("7", t.deps)).toBe("ok");
    const second = t.fetch.calls[1];
    expect(second?.url.startsWith(`${TEST_BASE_URL}/opinions/9/`)).toBe(true);
    for (const c of t.fetch.calls) {
      expect(c.url.startsWith("https://evil.test")).toBe(false);
      expect(c.headers["Authorization"]).toBe("Token SECRET");
    }
  });
});
