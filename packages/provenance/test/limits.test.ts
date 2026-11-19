import { describe, expect, it } from "vitest";
import {
  DIFF_CAP,
  HOOK_DEADLINE_MS,
  LABEL_MAX,
  LOCK_STALE_MS,
  LOCK_WAIT_MS,
  RACY_MS,
  SIZE_LIMIT,
  STALE_WINDOW_MS,
  STDIN_MAX,
  STDIN_WAIT_MS,
} from "../src/core/limits.js";

describe("limits (Requirements 1.3, 2.10)", () => {
  it("equal the numbers the requirements give", () => {
    expect(SIZE_LIMIT).toBe(200_000);
    expect(HOOK_DEADLINE_MS).toBe(20_000);
    expect(STALE_WINDOW_MS).toBe(12 * 60 * 60 * 1000);
    expect(LABEL_MAX).toBe(80);
    expect(STDIN_MAX).toBe(1024 * 1024);
    expect(STDIN_WAIT_MS).toBe(1_500);
    expect(LOCK_WAIT_MS).toBe(5_000);
    expect(RACY_MS).toBe(2_000);
    expect(DIFF_CAP).toBe(1_500);
    expect(LOCK_STALE_MS).toBe(30_000);
  });

  it("counts SIZE_LIMIT in UTF-16 code units", () => {
    const text = "\u{1F600}".repeat(SIZE_LIMIT);
    expect(text.length).toBe(400_000);
    expect(text.length).toBeGreaterThan(SIZE_LIMIT);
  });
});
