import { describe, expect, it } from "vitest";
import { withGate } from "../src/gate";
import { makeDeps } from "./support/make-deps";

describe("withGate", () => {
  it("runs concurrent calls in order without interleaving", async () => {
    const { deps } = makeDeps();
    const log: string[] = [];
    const job = (name: string) => async (): Promise<string> => {
      log.push(`${name}:start`);
      await Promise.resolve();
      await Promise.resolve();
      log.push(`${name}:end`);
      return name;
    };
    const results = await Promise.all([
      withGate(deps.state, job("a")),
      withGate(deps.state, job("b")),
      withGate(deps.state, job("c")),
    ]);
    expect(results).toEqual(["a", "b", "c"]);
    expect(log).toEqual(["a:start", "a:end", "b:start", "b:end", "c:start", "c:end"]);
  });

  it("passes a rejection to its caller and still runs later calls", async () => {
    const { deps } = makeDeps();
    const failing = withGate(deps.state, () => Promise.reject(new Error("boom")));
    const next = withGate(deps.state, () => Promise.resolve(7));
    await expect(failing).rejects.toThrow("boom");
    expect(await next).toBe(7);
  });
});
