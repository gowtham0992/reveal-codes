import { describe, expect, it } from "vitest";
import { nextStep } from "../src/components/next-step";

const BASE = { empty: false, verifying: false, verifiableUnchecked: 0, blocking: 0 };

describe("nextStep _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_", () => {
  it("names Load demo motion for an empty document", () => {
    expect(nextStep({ ...BASE, empty: true })).toBe("load-demo");
  });

  it("names Verify when something checkable is unchecked", () => {
    expect(nextStep({ ...BASE, verifiableUnchecked: 2 })).toBe("verify");
  });

  it("names Export when nothing is left to verify, even with blocking items", () => {
    expect(nextStep(BASE)).toBe("export");
    expect(nextStep({ ...BASE, blocking: 3 })).toBe("export");
  });

  it("names nothing while a run is in flight", () => {
    expect(nextStep({ ...BASE, verifying: true, empty: true, verifiableUnchecked: 4 })).toBe(
      "none",
    );
  });
});
