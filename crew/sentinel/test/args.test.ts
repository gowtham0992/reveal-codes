import { describe, expect, it } from "vitest";
import { parseArgs, USAGE } from "../src/args.js";

describe("parseArgs", () => {
  it("parses sweep and check without options", () => {
    expect(parseArgs(["sweep", "d"])).toEqual({
      ok: true,
      value: { kind: "sweep", dir: "d", json: null, out: null },
    });
    expect(parseArgs(["check", "f.docx"])).toEqual({
      ok: true,
      value: { kind: "check", file: "f.docx", json: null, out: null },
    });
  });

  it("accepts --json and --out in either order and around the operand", () => {
    const expected = { ok: true, value: { kind: "sweep", dir: "d", json: "j", out: "o" } };
    expect(parseArgs(["sweep", "d", "--json", "j", "--out", "o"])).toEqual(expected);
    expect(parseArgs(["sweep", "--out", "o", "d", "--json", "j"])).toEqual(expected);
    expect(parseArgs(["check", "f", "--out", "o"])).toEqual({
      ok: true,
      value: { kind: "check", file: "f", json: null, out: "o" },
    });
  });

  const bad: ReadonlyArray<readonly [string, readonly string[]]> = [
    ["no command", []],
    ["unknown command", ["scan", "d"]],
    ["no operand", ["sweep"]],
    ["no operand with option", ["check", "--out", "o"]],
    ["second operand", ["sweep", "a", "b"]],
    ["option without value", ["sweep", "d", "--json"]],
    ["option value starting with --", ["sweep", "d", "--out", "--json"]],
    ["repeated --json", ["sweep", "d", "--json", "a", "--json", "b"]],
    ["repeated --out", ["sweep", "d", "--out", "a", "--out", "b"]],
    ["unknown option", ["sweep", "d", "--verbose"]],
    ["literal --", ["sweep", "--", "d"]],
  ];

  it.each(bad)("rejects %s", (_name, argv) => {
    const result = parseArgs(argv);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message.length).toBeGreaterThan(0);
  });

  it("USAGE is the two documented lines", () => {
    expect(USAGE.split("\n")).toEqual([
      "usage: sentinel sweep <dir> [--json <file>] [--out <file>]",
      "       sentinel check <file.docx> [--json <file>] [--out <file>]",
    ]);
  });
});
