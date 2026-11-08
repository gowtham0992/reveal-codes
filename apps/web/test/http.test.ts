import { describe, expect, it } from "vitest";
import { jsonResponse, NO_STORE, notAllowed } from "../src/server/http";

describe("http helpers", () => {
  it("NO_STORE is Cache-Control: no-store", () => {
    expect(NO_STORE).toEqual({ "Cache-Control": "no-store" });
  });

  it("jsonResponse carries status, JSON body, content type and no-store", async () => {
    const res = jsonResponse(201, { a: [1, "b"] });
    expect(res.status).toBe(201);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(res.headers.get("Content-Type")).toBe("application/json");
    expect(await res.json()).toEqual({ a: [1, "b"] });
  });

  it("notAllowed gives 405 with Allow and no-store", () => {
    const res = notAllowed("POST")();
    expect(res.status).toBe(405);
    expect(res.headers.get("Allow")).toBe("POST");
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });
});
