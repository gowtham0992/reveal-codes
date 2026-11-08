import { describe, expect, it } from "vitest";
import { createManualClock } from "./manual-clock";
import { makeDeps } from "./make-deps";

const INIT = { method: "GET", headers: {}, redirect: "error" } as const;

describe("manual clock and scripted fetch self-test", () => {
  it("lets a hanging fetch reach the 15 000 ms timeout timer", async () => {
    const t = makeDeps([{ hang: true }]);
    const ctl = new AbortController();
    const start = t.clock.nowMs();
    const hung = t.fetch.fetch("https://cl.test/x", { ...INIT, signal: ctl.signal });
    const outcome = await Promise.race([
      hung.then(() => "fetch"),
      t.clock.sleep(15_000, ctl.signal).then(() => "timeout"),
    ]);
    ctl.abort();
    expect(outcome).toBe("timeout");
    expect(t.clock.nowMs() - start).toBe(15_000);
    await expect(hung).rejects.toThrow("aborted");
  });

  it("does not move time for an aborted timer and logs every sleep argument", async () => {
    const clock = createManualClock(0);
    const ctl = new AbortController();
    const slept = clock.sleep(5_000, ctl.signal);
    ctl.abort();
    await slept;
    expect(clock.nowMs()).toBe(0);
    expect(clock.pending()).toBe(0);
    await clock.sleep(40);
    expect(clock.nowMs()).toBe(40);
    expect(clock.sleeps).toEqual([5_000, 40]);
  });

  it("fires the earliest of several timers first and advance() fires due timers", async () => {
    const clock = createManualClock(0);
    const order: number[] = [];
    const slow = clock.sleep(300).then(() => order.push(300));
    const fast = clock.sleep(100).then(() => order.push(100));
    await Promise.all([slow, fast]);
    expect(order).toEqual([100, 300]);
    const later = clock.sleep(1_000);
    clock.advance(1_000);
    await later;
    expect(clock.nowMs()).toBe(1_300);
  });

  it("records calls with the decoded text field and replays steps", async () => {
    const t = makeDeps([{ status: 200, headers: { "Retry-After": "3" }, body: [{ a: 1 }] }]);
    const body = "text=" + encodeURIComponent("1 U.S. 1\n2 U.S. 2");
    const res = await t.fetch.fetch("https://cl.test/y", {
      ...INIT,
      method: "POST",
      body,
      signal: new AbortController().signal,
    });
    expect(res.headers.get("retry-after")).toBe("3");
    expect(JSON.parse(await res.text())).toEqual([{ a: 1 }]);
    expect(t.fetch.calls[0]?.text).toBe("1 U.S. 1\n2 U.S. 2");
    expect(t.fetch.remaining()).toBe(0);
  });
});
