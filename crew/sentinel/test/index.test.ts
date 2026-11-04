import { describe, expect, it } from "vitest";
import { PACKAGE_NAME } from "../src/index";

describe("sentinel placeholder", () => {
  it("exports its package name", () => {
    expect(PACKAGE_NAME).toBe("@reveal-codes/sentinel");
  });
});
