import { afterEach, describe, expect, it } from "vitest";
import { parseRecord } from "@reveal-codes/engine";
import { readFileSync } from "node:fs";
import { createBaselineCache } from "../src/io/baseline-cache.js";
import { runBaseline } from "../src/io/baseline-cmd.js";
import { nodeDeps } from "../src/io/deps.js";
import type { Fault } from "../src/io/deps.js";
import { recordFiles } from "../src/io/recorder-files.js";
import { listCandidates } from "../src/io/scan.js";
import { createStore } from "../src/io/store.js";
import { emptyState } from "./support/files-env.js";
import { makeTempDir, useIsolatedGit } from "./support/temp-repo.js";
import type { TempDir } from "./support/temp-repo.js";

useIsolatedGit();
let dir: TempDir | null = null;
afterEach(() => {
  dir?.cleanup();
});

async function event(d: TempDir, faults: Fault[]) {
  const deps = { ...nodeDeps(), log: { fault: (f: Fault) => (faults.push(f), Promise.resolve()) } };
  const store = createStore(deps, `${d.root}/.kiro/provenance`);
  const list = await listCandidates(deps, d.root);
  return recordFiles(
    {
      deps,
      root: d.root,
      store,
      cache: createBaselineCache(deps, store.cacheDir()),
      event: "agentStop",
      state: emptyState(),
      stateStatus: "absent",
      baseline: await store.readBaseline(),
      window: { windowRun: "turn 2026-01-01T00:00:00Z" },
      eventIso: "2026-01-01T00:00:00.000Z",
      startMs: Date.now(),
    },
    list.files,
  );
}

describe("recordFiles in a real git repository", () => {
  it("finds the Baseline_Text by Blob_Id after the file was committed again", async () => {
    dir = makeTempDir();
    dir.git("init", "-q");
    dir.write("a.txt", "one\ntwo\n");
    dir.git("add", "a.txt");
    dir.git("-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "-m", "first");
    expect((await runBaseline(nodeDeps(), dir.root)).ok).toBe(true);
    dir.write("a.txt", "one\nTWO\n");
    dir.git("add", "a.txt");
    dir.git("-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "-m", "second");
    const faults: Fault[] = [];
    await event(dir, faults);
    const record = readFileSync(`${dir.root}/.kiro/provenance/records/a.txt.reveal`, "utf8");
    const parsed = parseRecord(record);
    expect(parsed.ok && parsed.value.document.spans.map((s) => s.provenance.origin)).toEqual([
      "PST",
      "AI",
      "PST",
    ]);
    expect(faults).toEqual([]);
  });
});
