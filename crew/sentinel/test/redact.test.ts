import { describe, expect, it } from "vitest";
import { redact } from "../src/redact.js";

describe("redact _Requirements: 7.8, 7.10_", () => {
  it("replaces every occurrence of the token", () => {
    expect(redact("a SECRET b SECRET", "SECRET")).toBe("a [redacted] b [redacted]");
  });

  it("leaves the text unchanged when the token is absent or empty", () => {
    expect(redact("no secret here", "SECRET")).toBe("no secret here");
    expect(redact("text", "")).toBe("text");
    expect(redact("text", null)).toBe("text");
    expect(redact("text", undefined)).toBe("text");
  });
});
