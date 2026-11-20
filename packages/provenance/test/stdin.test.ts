import { describe, expect, it } from "vitest";
import { STDIN_MAX } from "../src/core/limits.js";
import { readStdin } from "../src/io/stdin.js";
import { closedStdin, memoryDeps, openStdin } from "./support/memory-deps.js";

describe("readStdin", () => {
  it("returns the text of input that closes in time, joined across chunks", async () => {
    const deps = memoryDeps({ timers: "manual", stdin: closedStdin('{"session_', 'id":"s"}') });
    await expect(readStdin(deps)).resolves.toBe('{"session_id":"s"}');
    expect(deps.clock.pendingTimers()).toBe(0);
  });

  it("returns the empty payload when stdin never closes, after the 1.5 s timer fires", async () => {
    const deps = memoryDeps({ timers: "manual", stdin: openStdin() });
    const reading = readStdin(deps);
    expect(deps.clock.pendingTimers()).toBe(1);
    deps.clock.fireTimers();
    await expect(reading).resolves.toBe("");
  });

  it("asks for a 1500 ms timer", async () => {
    const deps = memoryDeps({ stdin: openStdin() });
    const before = deps.clock.nowMs();
    await readStdin(deps);
    expect(deps.clock.nowMs() - before).toBe(1500);
  });

  it("takes exactly 1 MiB and drops 1 MiB plus one byte", async () => {
    const ok = memoryDeps({
      timers: "manual",
      stdin: closedStdin(new Uint8Array(STDIN_MAX).fill(97)),
    });
    expect((await readStdin(ok)).length).toBe(STDIN_MAX);
    const big = memoryDeps({
      timers: "manual",
      stdin: closedStdin(new Uint8Array(STDIN_MAX).fill(97), new Uint8Array([97])),
    });
    await expect(readStdin(big)).resolves.toBe("");
  });

  it("returns the empty payload for empty input", async () => {
    await expect(readStdin(memoryDeps({ stdin: closedStdin() }))).resolves.toBe("");
  });

  it("returns the empty payload for input that is not UTF-8", async () => {
    await expect(
      readStdin(memoryDeps({ stdin: closedStdin(new Uint8Array([0x7b, 0xff, 0x7d])) })),
    ).resolves.toBe("");
  });

  it("returns the empty payload when the stream fails", async () => {
    const failing: AsyncIterable<Uint8Array> = {
      [Symbol.asyncIterator]: () => ({ next: () => Promise.reject(new Error("EPIPE")) }),
    };
    await expect(readStdin(memoryDeps({ stdin: failing }))).resolves.toBe("");
  });
});
