import { describe, expect, it } from "vitest";
import { readEnv } from "../src/env";

describe("readEnv _Requirements: 13.10, 11.5_", () => {
  it("defaults the cache directory under the home directory", () => {
    expect(readEnv({}, "/home/u")).toEqual({
      cacheDir: "/home/u/.reveal-codes/cache",
      fixturesOnly: false,
    });
  });

  it("treats an empty token as absent and a set token as present", () => {
    expect("token" in readEnv({ COURTLISTENER_TOKEN: "" }, "/h")).toBe(false);
    expect(readEnv({ COURTLISTENER_TOKEN: "abc" }, "/h").token).toBe("abc");
  });

  it("takes the cache directory from the variable, and an empty one falls back", () => {
    expect(readEnv({ REVEAL_CODES_CACHE_DIR: "/tmp/c" }, "/h").cacheDir).toBe("/tmp/c");
    expect(readEnv({ REVEAL_CODES_CACHE_DIR: "" }, "/h/").cacheDir).toBe("/h/.reveal-codes/cache");
  });

  it("enables fixtures only for the exact value 1", () => {
    expect(readEnv({ REVEAL_CODES_FIXTURES_ONLY: "1" }, "/h").fixturesOnly).toBe(true);
    for (const v of ["0", "true", "", "01", " 1"]) {
      expect(readEnv({ REVEAL_CODES_FIXTURES_ONLY: v }, "/h").fixturesOnly).toBe(false);
    }
  });
});
