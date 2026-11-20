import { createDocument, renderRecord } from "@reveal-codes/engine";
import { describe, expect, it } from "vitest";
import { encodeBaseline } from "../src/core/baseline-codec.js";
import { encodeState } from "../src/core/state-codec.js";
import type { Baseline, WindowState } from "../src/core/types.js";
import { createStore } from "../src/io/store.js";
import { memoryDeps } from "./support/memory-deps.js";

const DIR = "/ws/.kiro/provenance";
const AT = "2026-01-01T00:00:00.000Z";
const D = "a".repeat(64);

function setup() {
  const deps = memoryDeps();
  deps.fs.put(`${DIR}/keep`, "x");
  return { deps, store: createStore(deps, DIR) };
}

function recordText(text: string): string {
  const doc = createDocument(text, AT);
  if (!doc.ok) throw new Error("createDocument failed");
  return renderRecord(doc.value, null, "full").text;
}

const baseline: Baseline = { version: 1, at: AT, files: { "a.ts": { sha256: D } } };
const state: WindowState = {
  version: 1,
  order: 0,
  lastWindowRun: null,
  lastEventAt: null,
  recordedAtMs: 1,
  noSessionIdLogged: false,
  sessions: {},
  files: {},
  skipped: {},
};

describe("layout", () => {
  it("puts a Record at records/<path>.reveal with / and the cache directory beside it", () => {
    const { store } = setup();
    expect(store.recordPath("src/a/b.ts")).toEqual({
      ok: true,
      value: `${DIR}/records/src/a/b.ts.reveal`,
    });
    expect(store.cacheDir()).toBe(`${DIR}/cache`);
  });

  it.each(["../x", "a/../b", "/abs", "a//b", "", "a\\b", "C:/x", "./a"])(
    "refuses the path %j",
    (path) => {
      expect(setup().store.recordPath(path).ok).toBe(false);
    },
  );
});

describe("Records", () => {
  it("writes a Record and reads it back through parseRecord", async () => {
    const { deps, store } = setup();
    const text = recordText("hello\n");
    expect((await store.writeRecord("src/a.ts", text)).ok).toBe(true);
    expect(deps.fs.text(`${DIR}/records/src/a.ts.reveal`)).toBe(text);
    const read = await store.readRecord("src/a.ts");
    expect(read.ok && read.value?.document.text).toBe("hello\n");
  });

  it("reads an absent Record as null", async () => {
    expect(await setup().store.readRecord("none.ts")).toEqual({ ok: true, value: null });
  });

  it("reports tampered_record for a file that does not parse and leaves it", async () => {
    const { deps, store } = setup();
    deps.fs.put(`${DIR}/records/a.ts.reveal`, "not a record");
    const read = await store.readRecord("a.ts");
    expect(!read.ok && read.error.kind).toBe("tampered_record");
    expect(deps.fs.text(`${DIR}/records/a.ts.reveal`)).toBe("not a record");
  });

  it("reports read_failed when the file cannot be read", async () => {
    const { deps, store } = setup();
    deps.fs.put(`${DIR}/records/a.ts.reveal`, "x");
    deps.fs.failWhen((op) => (op === "read" ? "EACCES" : null));
    const read = await store.readRecord("a.ts");
    expect(read).toEqual({ ok: false, error: { kind: "read_failed", detail: "EACCES" } });
  });

  it("removes the empty directories under records/ after a Record is deleted, and no others", async () => {
    const { deps, store } = setup();
    await store.writeRecord("a/b/c.ts", recordText("x"));
    await store.writeRecord("a/d.ts", recordText("y"));
    await store.deleteRecord("a/b/c.ts");
    expect(deps.fs.dirs.has(`${DIR}/records/a/b`)).toBe(false);
    expect(deps.fs.dirs.has(`${DIR}/records/a`)).toBe(true);
    await store.deleteRecord("a/d.ts");
    expect(deps.fs.dirs.has(`${DIR}/records/a`)).toBe(false);
    expect(deps.fs.dirs.has(`${DIR}/records`)).toBe(true);
    expect(deps.fs.dirs.has(DIR)).toBe(true);
  });

  it("deleting a Record that is not there is not an error", async () => {
    expect((await setup().store.deleteRecord("none.ts")).ok).toBe(true);
  });
});

describe("atomic write", () => {
  it("leaves the old file and no temporary file when the rename fails", async () => {
    const { deps, store } = setup();
    await store.writeRecord("a.ts", recordText("old"));
    const old = deps.fs.text(`${DIR}/records/a.ts.reveal`);
    deps.fs.failWhen((op) => (op === "rename" ? "EXDEV" : null));
    const result = await store.writeRecord("a.ts", recordText("new"));
    expect(result).toEqual({ ok: false, error: { kind: "write_failed", detail: "EXDEV" } });
    expect(deps.fs.text(`${DIR}/records/a.ts.reveal`)).toBe(old);
    expect([...deps.fs.files.keys()].some((k) => k.includes(".tmp-"))).toBe(false);
  });

  it("leaves the old file when the temporary file cannot be written", async () => {
    const { deps, store } = setup();
    await store.writeRecord("a.ts", recordText("old"));
    const old = deps.fs.text(`${DIR}/records/a.ts.reveal`);
    deps.fs.failWhen((op) => (op === "write" ? "ENOSPC" : null));
    expect((await store.writeRecord("a.ts", recordText("new"))).ok).toBe(false);
    expect(deps.fs.text(`${DIR}/records/a.ts.reveal`)).toBe(old);
  });

  it("writes the new file whole, and the temporary name sits in the same directory", async () => {
    const { deps, store } = setup();
    const names: string[] = [];
    deps.fs.failWhen((op, path) => (op === "write" ? (names.push(path), null) : null));
    await store.writeRecord("x/y.ts", recordText("new"));
    expect(names[0]?.startsWith(`${DIR}/records/x/y.ts.reveal.tmp-`)).toBe(true);
    expect([...deps.fs.files.keys()].some((k) => k.includes(".tmp-"))).toBe(false);
  });
});

describe("baseline.json and state.json", () => {
  it("reads absent files as null and round-trips what it wrote", async () => {
    const { deps, store } = setup();
    expect(await store.readBaseline()).toEqual({ ok: true, value: null });
    expect(await store.readState()).toEqual({ ok: true, value: null });
    await store.writeBaseline(baseline);
    await store.writeState(state);
    expect(deps.fs.text(`${DIR}/baseline.json`)).toBe(encodeBaseline(baseline));
    expect(deps.fs.text(`${DIR}/state.json`)).toBe(encodeState(state));
    expect(await store.readBaseline()).toEqual({ ok: true, value: baseline });
    expect(await store.readState()).toEqual({ ok: true, value: state });
  });

  it("returns bad_baseline and bad_state for files that do not decode, and leaves them", async () => {
    const { deps, store } = setup();
    deps.fs.put(`${DIR}/baseline.json`, "{");
    deps.fs.put(`${DIR}/state.json`, "[]");
    const b = await store.readBaseline();
    const s = await store.readState();
    expect(!b.ok && b.error.kind).toBe("bad_baseline");
    expect(!s.ok && s.error.kind).toBe("bad_state");
    expect(deps.fs.text(`${DIR}/baseline.json`)).toBe("{");
  });
});

describe("sessions.json", () => {
  it("is read as 0 when absent", async () => {
    expect(await setup().store.readSessions()).toEqual({ ok: true, value: 0 });
  });

  it("is written atomically as one line and read back", async () => {
    const { deps, store } = setup();
    await store.writeSessions(3);
    expect(deps.fs.text(`${DIR}/sessions.json`)).toBe(
      '{ "version": 1, "noPromptEventSessions": 3 }\n',
    );
    expect(await store.readSessions()).toEqual({ ok: true, value: 3 });
    deps.fs.failWhen((op) => (op === "rename" ? "EIO" : null));
    expect((await store.writeSessions(4)).ok).toBe(false);
    expect(deps.fs.text(`${DIR}/sessions.json`)).toBe(
      '{ "version": 1, "noPromptEventSessions": 3 }\n',
    );
  });

  it("is left as it is, with bad_sessions returned, when it does not parse", async () => {
    const { deps, store } = setup();
    deps.fs.put(`${DIR}/sessions.json`, '{"version":2}');
    const read = await store.readSessions();
    expect(!read.ok && read.error.kind).toBe("bad_sessions");
    expect(deps.fs.text(`${DIR}/sessions.json`)).toBe('{"version":2}');
  });
});
