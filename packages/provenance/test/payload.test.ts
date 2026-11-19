import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { STDIN_MAX } from "../src/core/limits.js";
import { parsePayload } from "../src/core/payload.js";
import type { Payload } from "../src/core/types.js";

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), "..", "fixtures");

type Fixture = {
  readonly payload?: Record<string, unknown>;
  readonly events?: ReadonlyArray<{ readonly payload: Record<string, unknown> }>;
};

function load(name: string): Fixture {
  return JSON.parse(readFileSync(join(FIXTURES, name), "utf8")) as Fixture;
}

function single(name: string): Record<string, unknown> {
  const payload = load(name).payload;
  if (payload === undefined) throw new Error(`fixture ${name} has no payload`);
  return payload;
}

const EMPTY: Payload = {
  sessionId: null,
  cwd: null,
  taskName: null,
  specName: null,
  taskSuccess: null,
};

function padded(bytes: number, filler: string, filledBytes: number): string {
  const head = '{"session_id":"s","cwd":"';
  const tail = '"}';
  const fixed = Buffer.byteLength(head + tail);
  const count = Math.ceil((bytes - fixed) / filledBytes);
  return head + filler.repeat(count) + tail;
}

describe("parsePayload (Requirements 3.15, 3.16, 3.19, 3.22, 16.6)", () => {
  it("parses the PreTaskExec fixture to the five fields, with the spec as a directory name", () => {
    const text = JSON.stringify(single("ide/pre-task-exec.json"));
    expect(parsePayload(text)).toEqual({
      sessionId: "<session C>",
      cwd: "<workspace>",
      taskName: "2. Probe task two",
      specName: "probe-scratch",
      taskSuccess: null,
    });
  });

  it("parses the PostTaskExec fixture including task_success", () => {
    const text = JSON.stringify(single("ide/post-task-exec.json"));
    expect(parsePayload(text)).toEqual({
      sessionId: "<session C>",
      cwd: "<workspace>",
      taskName: "2. Probe task two",
      specName: "probe-scratch",
      taskSuccess: true,
    });
  });

  it.each([
    "ide/user-prompt-submit.json",
    "ide/user-prompt-submit-tab-b.json",
    "cli/user-prompt-submit.json",
  ])("keeps only session_id and cwd of %s and nothing of the prompt", (name) => {
    const raw = single(name);
    const result = parsePayload(JSON.stringify(raw));
    expect(result).toEqual({ ...EMPTY, sessionId: raw["session_id"], cwd: raw["cwd"] });
    expect(JSON.stringify(result)).not.toContain(String(raw["prompt"]));
  });

  it.each(["ide/stop.json", "cli/stop.json"])("%s gives session_id and cwd only", (name) => {
    const raw = single(name);
    expect(parsePayload(JSON.stringify(raw))).toEqual({
      ...EMPTY,
      sessionId: raw["session_id"],
      cwd: raw["cwd"],
    });
  });

  it("drops tool_input and tool_response of the write events", () => {
    const raw = single("ide/post-tool-use-fs-write.json");
    const result = parsePayload(JSON.stringify(raw));
    expect(result).toEqual({ ...EMPTY, sessionId: raw["session_id"], cwd: raw["cwd"] });
    expect(Object.keys(result).sort()).toEqual(Object.keys(EMPTY).sort());
  });

  it("reduces every event of the sequence fixtures to at most the five fields", () => {
    for (const name of ["ide/specs-panel-session.json", "ide/orchestrator-session.json"]) {
      for (const event of load(name).events ?? []) {
        const result = parsePayload(JSON.stringify(event.payload));
        expect(result.sessionId).toBe(event.payload["session_id"]);
        expect(Object.keys(result).sort()).toEqual(Object.keys(EMPTY).sort());
        if (result.specName !== null) expect(result.specName).not.toMatch(/[\\/]/);
      }
    }
  });

  it.each([
    ["/home/u/ws/.kiro/specs/my-spec/tasks.md", "my-spec"],
    ["C:\\ws\\.kiro\\specs\\win-spec\\tasks.md", "win-spec"],
    ["my-spec", "my-spec"],
    ["tasks.md", null],
    ["", null],
  ])("spec_name %j becomes %j", (specName, expected) => {
    expect(parsePayload(JSON.stringify({ spec_name: specName })).specName).toBe(expected);
  });

  it("gives null for a spec_name that is not a string", () => {
    expect(parsePayload('{"spec_name":7}').specName).toBeNull();
  });

  it.each([
    ["empty", '{"session_id":"","cwd":"/w"}'],
    ["a number", '{"session_id":5,"cwd":"/w"}'],
    ["null", '{"session_id":null,"cwd":"/w"}'],
    ["an object", '{"session_id":{"a":1},"cwd":"/w"}'],
    ["missing", '{"cwd":"/w"}'],
  ])("session_id that is %s gives null and keeps cwd", (_name, text) => {
    expect(parsePayload(text)).toEqual({ ...EMPTY, cwd: "/w" });
  });

  it("ignores a task_success that is not a boolean", () => {
    expect(parsePayload('{"task_success":"true"}').taskSuccess).toBeNull();
  });

  it("accepts a payload of exactly 1 MiB and rejects one byte more", () => {
    const exact = padded(STDIN_MAX, "a", 1);
    expect(Buffer.byteLength(exact)).toBe(STDIN_MAX);
    expect(parsePayload(exact).sessionId).toBe("s");
    const over = exact.replace('"}', 'a"}');
    expect(Buffer.byteLength(over)).toBe(STDIN_MAX + 1);
    expect(parsePayload(over)).toEqual(EMPTY);
  });

  it("measures bytes, not characters", () => {
    const text = padded(STDIN_MAX + 2, "é", 2);
    expect(text.length).toBeLessThan(STDIN_MAX);
    expect(Buffer.byteLength(text)).toBeGreaterThan(STDIN_MAX);
    expect(parsePayload(text)).toEqual(EMPTY);
  });

  it.each([
    ["invalid JSON", "{not json"],
    ["empty text", ""],
    ["a JSON array", '[{"session_id":"s"}]'],
    ["a JSON string", '"session_id"'],
    ["a JSON number", "42"],
    ["JSON null", "null"],
  ])("gives the empty payload for %s", (_name, text) => {
    expect(parsePayload(text)).toEqual(EMPTY);
  });

  it("does not throw on nesting too deep to parse", () => {
    const deep = "[".repeat(200_000) + "]".repeat(200_000);
    expect(parsePayload(deep)).toEqual(EMPTY);
  });
});
