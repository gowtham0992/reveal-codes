import { parseRecord } from "@reveal-codes/engine";
import { describe, expect, it } from "vitest";
import { encodeBaseline } from "../src/core/baseline-codec.js";
import {
  BASELINE_AT,
  PROV,
  manual,
  pieces,
  play,
  step,
  windowRuns,
  workspace,
  write,
} from "./support/event-harness.js";
import type { MemoryDeps } from "./support/memory-deps.js";
/** The whole-line widening (Req 4.2, Decision 29) through `runRecord`, over in-memory dependencies. */
const FILE = "src/a.ts";
const enc = new TextEncoder();
/** A baselined file whose starting text is found by Blob_Id, so its Record starts all `[PST]`. */
function baselined(deps: MemoryDeps, text: string): void {
  const bytes = enc.encode(text);
  const entry = { sha256: deps.sha256(bytes), blob: deps.git.addBlob(bytes) };
  write(deps, FILE, text);
  deps.fs.put(
    `${PROV}/baseline.json`,
    encodeBaseline({ version: 1, at: BASELINE_AT, files: { [FILE]: entry } }),
  );
}
/** `promptSubmit`, the edit, `agentStop`; the window run of the session. */
async function agentEdit(deps: MemoryDeps, text: string): Promise<string> {
  await play(deps, step("ide/user-prompt-submit.json"));
  const win = (await windowRuns(deps, "sess-A"))[0] ?? "";
  write(deps, FILE, text);
  await play(deps, step("ide/stop.json"));
  return win;
}
/** A file that appears inside a window is `[AI:<win>.1]` all through; the edit follows outside any window. */
async function outsideEdit(deps: MemoryDeps, old: string, text: string): Promise<string> {
  const win = await agentEdit(deps, old);
  write(deps, FILE, text);
  await play(deps, manual);
  return win;
}
function runsOf(deps: MemoryDeps): [string, boolean][] {
  const parsed = parseRecord(deps.fs.text(`${PROV}/records/${FILE}.reveal`) ?? "");
  if (!parsed.ok) throw new Error("no readable Record");
  return parsed.value.document.runs.map((r) => [r.runId, r.relabelled]);
}
const textOf = (deps: MemoryDeps, origin: string): string[] =>
  pieces(deps, FILE)
    .filter((p) => p.origin === origin)
    .map((p) => p.text);
describe("whole-line widening through whole events (Req 4.2, Decision 29)", () => {
  for (const [label, eol] of [
    ["LF", "\n"],
    ["CR LF", "\r\n"],
  ] as const) {
    const lines = (...l: string[]): string => l.map((x) => x + eol).join("");
    const edit = (keeps: string[]): { old: string; text: string } => ({
      old: lines("// head", ...keeps, "  tail line;"),
      text: lines("// new first line", "// head", ...keeps, "  new indented line;", "  tail line;"),
    });
    const ins = [lines("// new first line"), lines("  new indented line;")];
    describe(label, () => {
      it("(1) an agent edit over an all-PST file records only the two inserted lines as AI", async () => {
        const { old, text } = edit(["  keep line 1;"]);
        const deps = workspace();
        baselined(deps, old);
        const win = await agentEdit(deps, text);
        expect(textOf(deps, "AI")).toEqual(ins);
        expect(
          pieces(deps, FILE)
            .filter((p) => p.origin === "AI")
            .map((p) => p.runId),
        ).toEqual([`${win}.1`, `${win}.2`]);
        expect(textOf(deps, "PST").join("")).toBe(old);
      });
      it("(2) with three unchanged lines between, only the inserted lines are AI", async () => {
        const { old, text } = edit(["  keep line 1;", "  keep line 2;", "  keep line 3;"]);
        const deps = workspace();
        baselined(deps, old);
        await agentEdit(deps, text);
        expect(textOf(deps, "AI")).toEqual(ins);
        expect(textOf(deps, "PST").join("")).toBe(old);
      });
      it("(3a) two outside edits over an all-AI file: the 0.4 rule relabels the run, the inserted lines are HUM", async () => {
        const { old, text } = edit(["  keep line 1;"]);
        const deps = workspace();
        const win = await outsideEdit(deps, old, text);
        expect(textOf(deps, "HUM")).toEqual(ins);
        // The insertions are more than 0.4 of the run's original length, so the Engine relabels it.
        expect(runsOf(deps)).toEqual([[`${win}.1`, true]]);
        const kept = pieces(deps, FILE).filter((p) => p.origin !== "HUM");
        expect(kept.every((p) => p.origin === "AI>HUM" && p.runId === `${win}.1`)).toBe(true);
        expect(kept.map((p) => p.text).join("")).toBe(old);
      });
      it("(3b) in a long agent run the edits stay under 0.4, so the unchanged lines are literally AI", async () => {
        const keeps = Array.from({ length: 14 }, (_, i) => `  keep line ${String(i + 1)};`);
        const { old, text } = edit(keeps);
        const deps = workspace();
        const win = await outsideEdit(deps, old, text);
        expect(textOf(deps, "HUM")).toEqual(ins);
        expect(textOf(deps, "AI")).toEqual([lines("// head", ...keeps), lines("  tail line;")]);
        expect(textOf(deps, "AI>HUM")).toEqual([]);
        const agent = pieces(deps, FILE).filter((p) => p.origin === "AI");
        expect(agent.every((p) => p.runId === `${win}.1`)).toBe(true);
        expect(runsOf(deps)).toEqual([[`${win}.1`, false]]);
      });
    });
  }
});

describe("the toKelvin case through whole events (task 10.11, Req 4.17)", () => {
  for (const [label, eol] of [
    ["LF", "\n"],
    ["CR LF", "\r\n"],
  ] as const) {
    it(`${label}: the new function is [AI:turn] from its first line to its blank line`, async () => {
      const lines = (...l: string[]): string => l.map((x) => x + eol).join("");
      const first = lines("function toFahrenheit(c) {", "  return (c * 9) / 5 + 32;", "}", "");
      const kelvin = lines("function toKelvin(celsius) {", "  return celsius + 273.15;", "}", "");
      const second = lines("function toCelsius(f) {", "  return f;", "}");
      const deps = workspace();
      baselined(deps, first + second);
      await agentEdit(deps, first + kelvin + second);
      expect(textOf(deps, "AI")).toEqual([kelvin]);
      expect(textOf(deps, "PST")).toEqual([first, second]);
      expect(pieces(deps, FILE).find((p) => p.origin === "AI")?.runId).toMatch(/^turn /);
    });
    it(`${label}: the same with a second edit in the turn (the CLI walk's shape)`, async () => {
      const lines = (...l: string[]): string => l.map((x) => x + eol).join("");
      const first = lines("function toFahrenheit(c) {", "  return (c * 9) / 5 + 32;", "}", "");
      const kelvin = lines("function toKelvin(celsius) {", "  return celsius + 273.15;", "}", "");
      const second = lines("function toCelsius(f) {", "  return (f - 32) * 5 / 9;", "}");
      const deps = workspace();
      baselined(deps, `// Temp${eol}${first}${second}`);
      await agentEdit(deps, `// Temperatures${eol}${first}${kelvin}${second}`);
      expect(textOf(deps, "AI")).toEqual(["eratures", kelvin]);
      expect(textOf(deps, "PST")).toEqual(["// Temp", eol + first, second]);
    });
  }
});
