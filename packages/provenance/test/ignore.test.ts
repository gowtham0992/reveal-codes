import { describe, expect, it } from "vitest";
import { isIgnored, isIgnoredByAny } from "../src/core/ignore.js";
import { parseIgnore } from "../src/core/ignore-parse.js";

type Case = { name: string; text: string; ignored: string[]; kept: string[] };

// A table drawn from the pattern-format section of the gitignore documentation.
const CASES: readonly Case[] = [
  {
    name: "blank and comment lines",
    text: "\n# a comment\n   \n\nfoo\n",
    ignored: ["foo"],
    kept: ["# a comment", "bar"],
  },
  { name: "escaped hash", text: "\\#a\n", ignored: ["#a", "d/#a"], kept: ["a"] },
  { name: "escaped bang", text: "\\!a\n", ignored: ["!a"], kept: ["a"] },
  { name: "trailing spaces are dropped", text: "foo   \n", ignored: ["foo"], kept: ["foo   "] },
  { name: "an escaped trailing space is kept", text: "foo\\ \n", ignored: ["foo "], kept: ["foo"] },
  {
    name: "carriage returns end a line",
    text: "foo\r\nbar\r\n",
    ignored: ["foo", "bar"],
    kept: ["foo\r"],
  },
  {
    name: "last match decides",
    text: "*.log\n!keep.log\n",
    ignored: ["a.log"],
    kept: ["keep.log"],
  },
  {
    name: "a later rule wins over a negation",
    text: "!keep.log\n*.log\n",
    ignored: ["keep.log"],
    kept: [],
  },
  {
    name: "no slash matches at any depth",
    text: "foo\n",
    ignored: ["foo", "a/foo", "a/b/foo", "foo/x"],
    kept: ["foobar", "a/foobar"],
  },
  { name: "a leading slash anchors", text: "/foo\n", ignored: ["foo", "foo/x"], kept: ["a/foo"] },
  {
    name: "an inner slash anchors",
    text: "a/b\n",
    ignored: ["a/b", "a/b/c"],
    kept: ["x/a/b", "a/x/b"],
  },
  {
    name: "a trailing slash matches directories only",
    text: "foo/\n",
    ignored: ["foo/x", "a/foo/x"],
    kept: ["foo", "a/foo"],
  },
  {
    name: "a trailing slash with an inner slash",
    text: "a/b/\n",
    ignored: ["a/b/c"],
    kept: ["a/b", "x/a/b/c"],
  },
  { name: "star does not cross a slash", text: "a/*.c\n", ignored: ["a/x.c"], kept: ["a/b/x.c"] },
  { name: "question mark", text: "?x\n", ignored: ["ax", "d/bx"], kept: ["x", "abx"] },
  { name: "range", text: "[a-c]x\n", ignored: ["ax", "cx"], kept: ["dx"] },
  { name: "negated range with bang", text: "[!a-c]x\n", ignored: ["dx"], kept: ["ax"] },
  { name: "negated range with caret", text: "[^a-c]x\n", ignored: ["dx"], kept: ["bx"] },
  { name: "POSIX class", text: "f[[:digit:]]\n", ignored: ["f1"], kept: ["fa"] },
  { name: "escaped star", text: "\\*\n", ignored: ["*", "d/*"], kept: ["a"] },
  { name: "leading **/", text: "**/foo\n", ignored: ["foo", "a/foo", "a/b/foo"], kept: ["a/foox"] },
  {
    name: "trailing /**",
    text: "foo/**\n",
    ignored: ["foo/a", "foo/a/b"],
    kept: ["foo", "x/foo/a"],
  },
  {
    name: "/**/ with zero and several directories",
    text: "a/**/b\n",
    ignored: ["a/b", "a/x/b", "a/x/y/b"],
    kept: ["a/x/c", "b"],
  },
  { name: "** elsewhere is a star", text: "a**b\n", ignored: ["axxb"], kept: ["ax/xb"] },
  {
    name: "unterminated bracket matches nothing",
    text: "[a\nfoo[\nok\n",
    ignored: ["ok"],
    kept: ["a", "foo[", "foo"],
  },
  {
    name: "a file cannot be re-included below an excluded directory",
    text: "dir/\n!dir/file\n",
    ignored: ["dir/file", "dir/other"],
    kept: [],
  },
  {
    name: "re-including the directory re-includes its files",
    text: "dir/*\n!dir/\n!dir/file\n",
    ignored: [],
    kept: ["dir/file"],
  },
  {
    name: "a file inside a re-included directory can be excluded again",
    text: "dir/*\n!dir/keep\n",
    ignored: ["dir/other"],
    kept: ["dir/keep"],
  },
  { name: "a byte order mark is skipped", text: "\uFEFFfoo\n", ignored: ["foo"], kept: ["bar"] },
];

describe("ignore matcher, table without git (Requirements 2.8, 2.9)", () => {
  it.each(CASES)("$name", ({ text, ignored, kept }) => {
    const rules = parseIgnore(text);
    for (const path of ignored) expect(isIgnored(rules, path), `ignored: ${path}`).toBe(true);
    for (const path of kept) expect(isIgnored(rules, path), `kept: ${path}`).toBe(false);
  });

  it("gives the same answers for the text of .kiroignore and of .kiro/provenance/ignore", () => {
    for (const { text, ignored, kept } of CASES) {
      const kiroignore = parseIgnore(text);
      const provenanceIgnore = parseIgnore(text);
      for (const path of [...ignored, ...kept]) {
        expect(isIgnoredByAny([kiroignore], path)).toBe(isIgnoredByAny([provenanceIgnore], path));
      }
    }
  });

  it("excludes a file when either ignore file excludes it", () => {
    const kiroignore = parseIgnore("secret.txt\n");
    const provenanceIgnore = parseIgnore("notes/\n");
    expect(isIgnoredByAny([kiroignore, provenanceIgnore], "secret.txt")).toBe(true);
    expect(isIgnoredByAny([kiroignore, provenanceIgnore], "notes/a.md")).toBe(true);
    expect(isIgnoredByAny([kiroignore, provenanceIgnore], "src/a.ts")).toBe(false);
    expect(isIgnored(provenanceIgnore, "secret.txt")).toBe(false);
    expect(isIgnored(kiroignore, "notes/a.md")).toBe(false);
  });

  it("a ! rule in one file does not re-include a file that the other file excludes", () => {
    const excluding = parseIgnore("*.log\n");
    const reincluding = parseIgnore("!a.log\n");
    expect(isIgnored(reincluding, "a.log")).toBe(false);
    expect(isIgnoredByAny([excluding, reincluding], "a.log")).toBe(true);
    expect(isIgnoredByAny([reincluding, excluding], "a.log")).toBe(true);
  });

  it("an empty rules value excludes nothing", () => {
    expect(isIgnored(parseIgnore(""), "a/b.txt")).toBe(false);
  });
});
