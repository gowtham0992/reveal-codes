import { describe, expect, it } from "vitest";
import { encodeBaseline } from "../src/core/baseline-codec.js";
import { SIZE_LIMIT } from "../src/core/limits.js";
import type { Baseline } from "../src/core/types.js";
import {
  BASELINE_AT,
  PROV,
  ROOT,
  hasRecord,
  logLines,
  manual,
  pieces,
  play,
  step,
  windowRuns,
  workspace,
  write,
} from "./support/event-harness.js";
import type { MemoryDeps } from "./support/memory-deps.js";

type Via = "blob" | "cache" | "none";
const enc = new TextEncoder();

/** Seeds a Baseline_File whose starting texts are found by Blob_Id, in the cache, or nowhere. */
function seedBaseline(
  deps: MemoryDeps,
  files: Record<string, { text: string; via: Via }>,
): string[] {
  const entries: Baseline["files"] = {};
  const digests: string[] = [];
  for (const [path, { text, via }] of Object.entries(files)) {
    const bytes = enc.encode(text);
    const sha256 = deps.sha256(bytes);
    digests.push(sha256);
    entries[path] = via === "blob" ? { sha256, blob: deps.git.addBlob(bytes) } : { sha256 };
    if (via === "cache") deps.fs.put(`${PROV}/cache/${sha256}`, bytes);
    write(deps, path, text);
  }
  deps.fs.put(
    `${PROV}/baseline.json`,
    encodeBaseline({ version: 1, at: BASELINE_AT, files: entries }),
  );
  return digests;
}

const cacheFiles = (deps: MemoryDeps): string[] =>
  [...deps.fs.files.keys()].filter((p) => p.startsWith(`${PROV}/cache/`));

describe("the first change of a baselined file, through whole events (Req 16.7, 16.8)", () => {
  it("builds the Record from the starting text found by Blob_Id or in the cache, else records [PST]", async () => {
    const deps = workspace();
    seedBaseline(deps, {
      "blob.txt": { text: "one\ntwo\n", via: "blob" },
      "cache.txt": { text: "p\nq\n", via: "cache" },
      "gone.txt": { text: "x\ny\n", via: "none" },
    });
    await play(deps, step("ide/user-prompt-submit.json"));
    const win = (await windowRuns(deps, "sess-A"))[0] ?? "";
    write(deps, "blob.txt", "one\nTWO\n");
    write(deps, "cache.txt", "p\nQ\n");
    write(deps, "gone.txt", "x\nY\n");
    await play(deps, step("ide/stop.json"));
    // The edited stretch is the minimal changed one (Req 4.15): only the changed letter is AI.
    const expected = (first: string, second: string) => [
      { origin: "PST", runId: null, text: first },
      { origin: "AI", runId: `${win}.1`, text: second },
      { origin: "PST", runId: null, text: "\n" },
    ];
    expect(pieces(deps, "blob.txt")).toEqual(expected("one\n", "TWO"));
    expect(pieces(deps, "cache.txt")).toEqual(expected("p\n", "Q"));
    expect(pieces(deps, "gone.txt")).toEqual([{ origin: "PST", runId: null, text: "x\nY\n" }]);
    expect(logLines(deps)).toEqual(["agentStop gone.txt baseline_text_unavailable"]);
    const kept = JSON.parse(deps.fs.text(`${PROV}/baseline.json`) ?? "") as Baseline;
    expect(kept.files).toEqual({});
    expect(cacheFiles(deps)).toEqual([]);
  });

  it("attributes a first change outside any window to HUM", async () => {
    const deps = workspace();
    seedBaseline(deps, { "a.txt": { text: "one\ntwo\n", via: "blob" } });
    write(deps, "a.txt", "one\nTWO\n");
    await play(deps, manual);
    expect(pieces(deps, "a.txt").map((p) => p.origin)).toEqual(["PST", "HUM", "PST"]);
  });
});

describe("files that appear, move, vanish or stop being text, through whole events", () => {
  it("a file that appears inside a window is AI, and outside one HUM", async () => {
    const deps = workspace();
    write(deps, "before.txt", "early\n");
    await play(deps, step("ide/user-prompt-submit.json"));
    const win = (await windowRuns(deps, "sess-A"))[0] ?? "";
    write(deps, "inside.txt", "late\n");
    await play(deps, step("ide/stop.json"));
    expect(pieces(deps, "before.txt").map((p) => p.origin)).toEqual(["HUM"]);
    expect(pieces(deps, "inside.txt")).toEqual([
      { origin: "AI", runId: `${win}.1`, text: "late\n" },
    ]);
  });

  it("a rename moves the Record without changing a span and a deletion removes it", async () => {
    const deps = workspace();
    await play(deps, step("ide/user-prompt-submit.json"));
    write(deps, "d/old.txt", "moving\n");
    write(deps, "gone.txt", "going\n");
    await play(deps, step("ide/stop.json"));
    const before = pieces(deps, "d/old.txt");
    await play(deps, step("ide/user-prompt-submit.json"));
    deps.fs.files.delete(`${ROOT}/d/old.txt`);
    deps.fs.files.delete(`${ROOT}/gone.txt`);
    write(deps, "new.txt", "moving\n");
    await play(deps, step("ide/stop.json"));
    expect(pieces(deps, "new.txt")).toEqual(before);
    expect(hasRecord(deps, "d/old.txt")).toBe(false);
    expect(hasRecord(deps, "gone.txt")).toBe(false);
    expect(logLines(deps)).toEqual([]);
  });

  it("a file that becomes binary loses its Record, and an over-limit file is logged once", async () => {
    const deps = workspace();
    await play(deps, step("ide/user-prompt-submit.json"));
    write(deps, "a.txt", "text\n");
    write(deps, "big.txt", "x".repeat(SIZE_LIMIT + 1));
    await play(deps, step("ide/stop.json"));
    expect(hasRecord(deps, "a.txt")).toBe(true);
    expect(hasRecord(deps, "big.txt")).toBe(false);
    deps.fs.put(`${ROOT}/a.txt`, new Uint8Array([120, 0, 121]));
    await play(deps, manual);
    await play(deps, manual);
    expect(hasRecord(deps, "a.txt")).toBe(false);
    expect(logLines(deps)).toEqual(["agentStop big.txt over_limit"]);
  });
});
