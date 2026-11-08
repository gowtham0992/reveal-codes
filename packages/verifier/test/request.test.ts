import { describe, expect, it } from "vitest";
import { authHeaders, buildLookupRequest } from "../src/request";

const BASE = "https://cl.test/api/rest/v4";

describe("buildLookupRequest", () => {
  it("posts the lines joined by newline as an encoded form body", () => {
    const { url, spec } = buildLookupRequest({ baseUrl: BASE }, ["556 U.S. 662", "1 H. 150"]);
    expect(url).toBe(`${BASE}/citation-lookup/`);
    expect(spec.method).toBe("POST");
    expect(spec.body).toBe("text=556%20U.S.%20662%0A1%20H.%20150");
    expect(decodeURIComponent((spec.body ?? "").slice(5))).toBe("556 U.S. 662\n1 H. 150");
  });
  it("sends no headers besides Content-Type and Accept without a token", () => {
    const { spec } = buildLookupRequest({ baseUrl: BASE }, ["1 U.S. 1"]);
    expect(Object.keys(spec.headers).sort()).toEqual(["Accept", "Content-Type"]);
    expect(spec.headers["Content-Type"]).toBe("application/x-www-form-urlencoded");
    expect(spec.headers["Accept"]).toBe("application/json");
  });
  it("adds only Authorization when a token is configured", () => {
    const { spec } = buildLookupRequest({ baseUrl: BASE, token: "secret" }, ["1 U.S. 1"]);
    expect(Object.keys(spec.headers).sort()).toEqual(["Accept", "Authorization", "Content-Type"]);
    expect(spec.headers["Authorization"]).toBe("Token secret");
  });
  it("treats an empty token as absent", () => {
    const { spec } = buildLookupRequest({ baseUrl: BASE, token: "" }, ["1 U.S. 1"]);
    expect(spec.headers["Authorization"]).toBeUndefined();
  });
});

describe("authHeaders", () => {
  const deps = { baseUrl: BASE, token: "secret" };
  it("attaches the token to URLs under the Base_URL", () => {
    expect(authHeaders(deps, `${BASE}/clusters/1/`, {})).toEqual({ Authorization: "Token secret" });
  });
  it("never attaches the token off the Base_URL", () => {
    for (const url of [
      "https://evil.test/x",
      `${BASE}x/y`,
      BASE,
      "https://cl.test/api/rest/v4.evil/",
    ]) {
      expect(authHeaders(deps, url, { Accept: "a" })).toEqual({ Accept: "a" });
    }
  });
  it("never attaches without a token", () => {
    expect(authHeaders({ baseUrl: BASE }, `${BASE}/x/`, {})).toEqual({});
  });
});
