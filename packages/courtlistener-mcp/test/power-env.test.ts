import { describe, expect, it } from "vitest";
import { hasUsableToken, powerEnv } from "../src/power-env";
describe("powerEnv", () => {
  it("keeps a real token and leaves the environment alone", () => {
    const env = { COURTLISTENER_TOKEN: "abc123", PATH: "/bin" };
    expect(powerEnv(env)).toBe(env);
  });
  it("switches on fixtures mode and drops the token when it is missing, empty or a placeholder", () => {
    for (const token of [undefined, "", "  ", "${COURTLISTENER_TOKEN}", " ${X}"]) {
      const out = powerEnv({ COURTLISTENER_TOKEN: token, PATH: "/bin" });
      expect(out).toEqual({ PATH: "/bin", REVEAL_CODES_FIXTURES_ONLY: "1" });
      expect("COURTLISTENER_TOKEN" in out).toBe(false);
    }
  });
  it("classifies tokens", () => {
    expect(hasUsableToken("tok")).toBe(true);
    expect(hasUsableToken("$tok")).toBe(true);
    expect(hasUsableToken("${tok}")).toBe(false);
    expect(hasUsableToken(undefined)).toBe(false);
  });
});
