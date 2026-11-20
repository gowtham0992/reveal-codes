import { renderRecord } from "@reveal-codes/engine";
import { describe, expect, it } from "vitest";
import { SIZE_LIMIT } from "../src/core/limits.js";
import { updateRecord } from "../src/core/update.js";
import { AT, PROV, ROOT, WINDOW, docOf, makeEnv, origins } from "./support/files-env.js";
import type { Env } from "./support/files-env.js";

const clock = { nowIso: () => "2026-01-01T00:00:00Z" };

/** A Document whose second line is `AI` text of WINDOW's Run 1. */
function agentDoc() {
  const made = updateRecord(docOf("x\ny\n"), "x\nY\n", "AI", WINDOW, clock);
  if (!made.ok) throw new Error(made.error.kind);
  return made.value;
}

function countReads(env: Env, path: string): () => number {
  let reads = 0;
  env.deps.fs.failWhen((op, p) => {
    if (op === "read" && p === `${ROOT}/${path}`) reads += 1;
    return null;
  });
  return () => reads;
}

describe("First_Change", () => {
  it("builds the Record from the Baseline_Text found by Blob_Id and leaves other cache files", async () => {
    const env = makeEnv();
    env.seedBaseline({
      "a.txt": { text: "one\ntwo\n", inGit: true },
      "b.txt": { text: "bee\n" },
    });
    const other = env.seedCache("bee\n");
    env.put("a.txt", "one\nTWO\n");
    env.put("b.txt", "bee\n");
    const outcome = await env.run();
    const doc = env.doc("a.txt");
    expect(doc?.text).toBe("one\nTWO\n");
    expect(doc === null ? [] : origins(doc)).toEqual(["PST", "AI", "PST"]);
    expect(doc?.spans[0]?.provenance.timestamp).toBe(AT);
    expect(doc?.spans[1]?.provenance.runId).toBe(`${WINDOW.windowRun}.1`);
    expect(Object.keys(env.baseline()?.files ?? {})).toEqual(["b.txt"]);
    expect(env.cacheNames()).toEqual([`${PROV}/cache/${other}`]);
    expect(outcome.outsideFound).toBe(false);
    expect(env.reasons()).toEqual([]);
  });

  it("reads the Baseline_Text from the cache and deletes the cache file with the last entry", async () => {
    const env = makeEnv();
    env.seedBaseline({ "a.txt": { text: "one\ntwo\n" }, "b.txt": { text: "one\ntwo\n" } });
    env.seedCache("one\ntwo\n");
    env.put("a.txt", "one\n2\n");
    env.put("b.txt", "one\ntwo\n");
    await env.run({ window: null });
    expect(env.doc("a.txt")?.spans.map((s) => s.provenance.origin)).toEqual(["PST", "HUM", "PST"]);
    expect(env.cacheNames()).toHaveLength(1);
    env.put("b.txt", "one\nthree\n");
    await env.run({ window: null });
    expect(env.cacheNames()).toEqual([]);
    expect(env.baseline()?.files).toEqual({});
  });

  it("records the current text as PST when the Baseline_Text is not found", async () => {
    const env = makeEnv();
    env.seedBaseline({ "a.txt": { text: "one\n" }, "b.txt": { text: "bee\n" } });
    const other = env.seedCache("bee\n");
    env.put("a.txt", "one\ntwo\n");
    env.put("b.txt", "bee\n");
    const outcome = await env.run();
    const doc = env.doc("a.txt");
    expect(doc?.text).toBe("one\ntwo\n");
    expect(doc?.spans.map((s) => s.provenance.origin)).toEqual(["PST"]);
    expect(doc?.runs).toEqual([]);
    expect(doc?.spans[0]?.provenance.timestamp).toBe(env.deps.clock.nowIso());
    expect(env.reasons()).toEqual(["a.txt baseline_text_unavailable"]);
    expect(Object.keys(env.baseline()?.files ?? {})).toEqual(["b.txt"]);
    expect(env.cacheNames()).toEqual([`${PROV}/cache/${other}`]);
    expect(outcome.outsideFound).toBe(false);
  });
});

describe("a file that appears", () => {
  it("is AI with Run <Window_Run>.1 inside a window", async () => {
    const env = makeEnv();
    env.put("n.txt", "new\ntext\n");
    const outcome = await env.run();
    const doc = env.doc("n.txt");
    expect(doc === null ? [] : origins(doc)).toEqual(["AI"]);
    expect(doc?.spans[0]?.provenance.runId).toBe(`${WINDOW.windowRun}.1`);
    expect(outcome.outsideFound).toBe(false);
  });

  it("is HUM outside a window and counts as an outside difference", async () => {
    const env = makeEnv();
    env.put("n.txt", "new\n");
    const outcome = await env.run({ window: null });
    expect(origins(env.doc("n.txt") ?? docOf(""))).toEqual(["HUM"]);
    expect(outcome.outsideFound).toBe(true);
  });
});

describe("renames", () => {
  it("changes only the path of an Unchanged_File's entry", async () => {
    const env = makeEnv();
    env.seedBaseline({ "a.txt": { text: "same\n", inGit: true } });
    env.put("b.txt", "same\n");
    await env.run();
    const files = env.baseline()?.files ?? {};
    expect(Object.keys(files)).toEqual(["b.txt"]);
    expect(files["b.txt"]?.blob).toBeDefined();
    expect(env.recordText("b.txt")).toBeNull();
  });

  it("moves the Record of a recorded file and changes no span", async () => {
    const env = makeEnv();
    const doc = agentDoc();
    env.seedRecord("old/a.txt", doc);
    env.put("new/b.txt", "x\nY\n");
    await env.run({ window: null });
    expect(env.recordText("new/b.txt")).toBe(renderRecord(doc, null, "full").text);
    expect(env.recordText("old/a.txt")).toBeNull();
    expect(env.deps.fs.dirs.has(`${PROV}/records/old`)).toBe(false);
  });

  it("treats a rename plus an edit as a deletion plus a creation", async () => {
    const env = makeEnv();
    env.seedRecord("a.txt", agentDoc());
    env.put("b.txt", "x\nY\nZ\n");
    const outcome = await env.run({ window: null });
    expect(env.recordText("a.txt")).toBeNull();
    expect(origins(env.doc("b.txt") ?? docOf(""))).toEqual(["HUM"]);
    expect(outcome.outsideFound).toBe(true);
  });
});

describe("deletion", () => {
  it("deletes the Record and prunes empty directories", async () => {
    const env = makeEnv();
    env.seedRecord("d/e/a.txt", agentDoc());
    await env.run();
    expect(env.recordText("d/e/a.txt")).toBeNull();
    expect(env.deps.fs.dirs.has(`${PROV}/records/d`)).toBe(false);
  });

  it("deletes the entry and its cache file unless another entry has the digest", async () => {
    const env = makeEnv();
    env.seedBaseline({
      "a.txt": { text: "t\n" },
      "b.txt": { text: "t\n" },
      "c.txt": { text: "u\n" },
    });
    env.seedCache("t\n");
    env.put("c.txt", "u\n");
    await env.run();
    expect(env.cacheNames()).toEqual([]);
    expect(Object.keys(env.baseline()?.files ?? {})).toEqual(["c.txt"]);
  });

  it("keeps the cache file while another entry has the digest", async () => {
    const env = makeEnv();
    env.seedBaseline({ "a.txt": { text: "t\n" }, "b.txt": { text: "t\n" } });
    env.seedCache("t\n");
    env.put("b.txt", "t\n");
    await env.run();
    expect(env.cacheNames()).toHaveLength(1);
    expect(Object.keys(env.baseline()?.files ?? {})).toEqual(["b.txt"]);
  });
});

describe("files that stop being tracked", () => {
  it("loses its Record when it becomes binary, with no Fault_Log line", async () => {
    const env = makeEnv();
    env.seedRecord("a.txt", agentDoc());
    env.put("a.txt", new Uint8Array([120, 0, 121]));
    await env.run();
    expect(env.recordText("a.txt")).toBeNull();
    expect(env.reasons()).toEqual([]);
  });

  it("loses its entry when it becomes binary", async () => {
    const env = makeEnv();
    env.seedBaseline({ "a.txt": { text: "t\n" } });
    env.put("a.txt", new Uint8Array([255, 254]));
    await env.run();
    expect(env.baseline()?.files).toEqual({});
  });

  it("loses its Record when it falls over the limit, and over_limit is logged once", async () => {
    const env = makeEnv();
    env.seedRecord("a.txt", agentDoc());
    env.put("a.txt", "x".repeat(SIZE_LIMIT + 1));
    await env.run();
    expect(env.recordText("a.txt")).toBeNull();
    expect(env.reasons()).toEqual(["a.txt over_limit"]);
    await env.run();
    expect(env.reasons()).toEqual(["a.txt over_limit"]);
    env.put("a.txt", "x".repeat(SIZE_LIMIT + 2));
    await env.run();
    expect(env.reasons()).toEqual(["a.txt over_limit", "a.txt over_limit"]);
  });

  it("loses its Record when it becomes excluded", async () => {
    const env = makeEnv();
    env.seedRecord(".env", agentDoc());
    env.put(".env", "SECRET=1\n");
    await env.run();
    expect(env.recordText(".env")).toBeNull();
  });
});

describe("faults that keep the old state", () => {
  it("leaves a tampered Record as it is, logs it and writes no new Record", async () => {
    const env = makeEnv();
    const path = `${PROV}/records/a.txt.reveal`;
    env.deps.fs.put(path, "[HUM][CIT");
    env.put("a.txt", "something\n");
    await env.run();
    expect(env.deps.fs.text(path)).toBe("[HUM][CIT");
    expect(env.reasons()).toEqual(["a.txt tampered_record"]);
  });

  it("keeps the Record when apply fails and logs the error kind", async () => {
    const env = makeEnv();
    env.seedRecord("a.txt", docOf("one\n"));
    const before = env.recordText("a.txt");
    env.put("a.txt", "two\n");
    await env.run({ eventIso: "yesterday" });
    expect(env.recordText("a.txt")).toBe(before);
    expect(env.reasons()).toHaveLength(1);
    expect(env.reasons()[0]).toMatch(/^a\.txt apply_failed:/u);
  });

  it("keeps the Baseline_Entry when apply fails", async () => {
    const env = makeEnv();
    env.seedBaseline({ "a.txt": { text: "one\n", inGit: true } });
    env.put("a.txt", "two\n");
    await env.run({ eventIso: "yesterday" });
    expect(env.recordText("a.txt")).toBeNull();
    expect(Object.keys(env.baseline()?.files ?? {})).toEqual(["a.txt"]);
  });

  it("keeps the Record and entry of a file that changes during the update", async () => {
    const env = makeEnv();
    env.seedBaseline({ "a.txt": { text: "one\n", inGit: true } });
    env.put("a.txt", "two\n");
    let stats = 0;
    env.deps.fs.failWhen((op, p) => {
      if (op === "lstat" && p === `${ROOT}/a.txt` && ++stats === 3) {
        env.deps.fs.put(p, "three\n", 1);
      }
      return null;
    });
    await env.run();
    expect(env.recordText("a.txt")).toBeNull();
    expect(Object.keys(env.baseline()?.files ?? {})).toEqual(["a.txt"]);
    expect(env.state?.files["a.txt"]).toBeUndefined();
  });

  it("creates no Record that depends on an entry when the Baseline_File is bad", async () => {
    const env = makeEnv();
    env.deps.fs.put(`${PROV}/baseline.json`, "{ not json");
    env.put("a.txt", "text\n");
    await env.run();
    expect(env.recordText("a.txt")).toBeNull();
    expect(env.deps.fs.text(`${PROV}/baseline.json`)).toBe("{ not json");
    expect(env.reasons()).toEqual(["- bad_baseline"]);
  });

  it("drops an entry that a crash left beside a Record", async () => {
    const env = makeEnv();
    env.seedBaseline({ "a.txt": { text: "one\n" } });
    env.seedRecord("a.txt", docOf("one\n"));
    env.put("a.txt", "one\n");
    await env.run();
    expect(env.baseline()?.files).toEqual({});
  });
});

describe("the state hint and the deadline", () => {
  it("skips a file whose size and time match and are not racy", async () => {
    const env = makeEnv();
    env.seedRecord("a.txt", docOf("one\n"));
    env.put("a.txt", "one\n");
    await env.run();
    const reads = countReads(env, "a.txt");
    env.put("a.txt", "two\n");
    await env.run();
    expect(reads()).toBe(0);
    expect(env.doc("a.txt")?.text).toBe("one\n");
  });

  it("reads again in the racy case, with no state.json and with a bad one", async () => {
    const env = makeEnv();
    env.seedRecord("a.txt", docOf("one\n"));
    env.put("a.txt", "one\n", env.deps.clock.nowMs() - 500);
    await env.run();
    const reads = countReads(env, "a.txt");
    await env.run();
    expect(reads()).toBe(1);
    env.put("a.txt", "one\n");
    await env.run();
    const trusted = reads();
    await env.run();
    expect(reads()).toBe(trusted);
    await env.run({ stateStatus: "absent" });
    expect(reads()).toBe(trusted + 1);
    await env.run({ stateStatus: "bad" });
    expect(reads()).toBe(trusted + 2);
    expect(env.reasons()).toEqual(["- bad_state"]);
  });

  it("stops before each file at the deadline and logs how many were not reached", async () => {
    const env = makeEnv();
    env.seedRecord("a.txt", docOf("one\n"));
    env.seedRecord("b.txt", docOf("one\n"));
    env.put("a.txt", "two\n");
    env.put("b.txt", "two\n");
    const outcome = await env.run({ startMs: env.deps.clock.nowMs() - 20_001 });
    expect(outcome.notReached).toBe(2);
    expect(env.reasons()).toEqual(["- deadline_reached:2"]);
    expect(env.doc("a.txt")?.text).toBe("one\n");
    expect(env.doc("b.txt")?.text).toBe("one\n");
  });
});
