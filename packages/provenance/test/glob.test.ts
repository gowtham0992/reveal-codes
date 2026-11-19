import { describe, expect, it } from "vitest";
import { compileGlob, encodeParts, matchGlob } from "../src/core/glob.js";

const m = (pattern: string, path: string): boolean =>
  matchGlob(compileGlob(pattern), encodeParts(path.split("/")));

// [pattern, path, expected]; patterns are as the parser hands them over (no `!`, no trailing `/`).
const TABLE: ReadonlyArray<readonly [string, string, boolean]> = [
  ["foo", "foo", true],
  ["foo", "foo/bar", false],
  ["*.log", "a.log", true],
  ["*.log", "dir/a.log", false],
  ["a*", "a", true],
  ["*", "x", true],
  ["*", "x/y", false],
  ["a/*/b", "a/x/b", true],
  ["a/*/b", "a/x/y/b", false],
  ["?", "a", true],
  ["?", "ab", false],
  ["a?c", "abc", true],
  ["[a-c]x", "bx", true],
  ["[a-c]x", "dx", false],
  ["[!a-c]x", "dx", true],
  ["[!a-c]x", "bx", false],
  ["[^a-c]x", "dx", true],
  ["[^a-c]x", "ax", false],
  ["[[:digit:]]", "7", true],
  ["[[:digit:]]", "x", false],
  ["[[:upper:][:digit:]]", "Q", true],
  ["[]a]", "]", true],
  ["[a-]", "-", true],
  ["[a\\]]", "]", true],
  ["\\*", "*", true],
  ["\\*", "a", false],
  ["\\?x", "?x", true],
  ["\\#a", "#a", true],
  ["\\!a", "!a", true],
  ["a\\ ", "a ", true],
  ["**/foo", "foo", true],
  ["**/foo", "a/foo", true],
  ["**/foo", "a/b/c/foo", true],
  ["**/foo", "a/foobar", false],
  ["foo/**", "foo", false],
  ["foo/**", "foo/x", true],
  ["foo/**", "foo/x/y/z", true],
  ["a/**/b", "a/b", true],
  ["a/**/b", "a/x/b", true],
  ["a/**/b", "a/x/y/b", true],
  ["a/**/b", "a/x/y/c", false],
  ["**", "a/b", true],
  ["a**b", "axxb", true],
  ["a**b", "ax/xb", false],
  ["**a", "xa", true],
  ["**a", "x/a", false],
  ["x/***/y", "x/y", true],
  ["a\\/b", "a/b", true],
];

describe("glob (Requirements 2.9, 1.3)", () => {
  it.each(TABLE)("%s against %s is %s", (pattern, path, expected) => {
    expect(m(pattern, path)).toBe(expected);
  });

  it("an unterminated bracket matches nothing, with or without a star before it", () => {
    for (const pattern of ["[", "[a", "[a-", "a[", "*[a", "[[:digit:", "a/[b"]) {
      expect(compileGlob(pattern).never).toBe(true);
      expect(m(pattern, "a")).toBe(false);
      expect(m(pattern, "a/[b")).toBe(false);
    }
  });

  it("an unknown POSIX class name and a trailing backslash match nothing", () => {
    expect(m("[[:nope:]]", "a")).toBe(false);
    expect(m("a\\", "a")).toBe(false);
    expect(m("a\\", "a\\")).toBe(false);
  });

  it("a bracket class never matches a slash, so an anchored pattern with [/] matches nothing", () => {
    expect(m("a[/]b", "a/b")).toBe(false);
    expect(m("a[!x]b", "a/b")).toBe(false);
  });

  it("compares bytes: ? matches one byte, so it does not match a two-byte character", () => {
    expect(m("?", "e")).toBe(true);
    expect(m("?", "\u00e9")).toBe(false);
    expect(m("??", "\u00e9")).toBe(true);
    expect(m("\u00e9", "\u00e9")).toBe(true);
  });

  it("a pattern of 5,000 stars and a's against a long path completes in linear time", () => {
    const pattern = "*a".repeat(2500);
    const path = `${"a".repeat(20000)}b`;
    const start = performance.now();
    const hit = m(pattern, "a".repeat(20000));
    const miss = m(pattern, path);
    const elapsed = performance.now() - start;
    expect(hit).toBe(true);
    expect(miss).toBe(false);
    expect(elapsed).toBeLessThan(2000);
  });

  it("many ** segments against a long path of directories complete quickly", () => {
    const pattern = `${"**/a/".repeat(500)}z`;
    const path = `${"a/".repeat(5000)}y`;
    const start = performance.now();
    expect(m(pattern, path)).toBe(false);
    expect(performance.now() - start).toBeLessThan(5000);
  });
});
