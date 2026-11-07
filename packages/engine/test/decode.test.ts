import { describe, expect, it } from "vitest";
import { decodeTokens } from "../src/codes/decode.js";
import { lexCodes } from "../src/codes/lex.js";

const TS = "2026-11-03T10:00:00Z";
const DOC = "[DOC{v=1;n=2;r=r1,40,3,1}]";
const PST = `[PST{t=${TS}}]`;

function decode(input: string) {
  const lexed = lexCodes(input);
  if (!lexed.ok) throw new Error(`lex fault in test input: ${lexed.error.rule}`);
  return decodeTokens(lexed.value);
}

describe("codes/decode (_Requirements: 20.1, 20.3_)", () => {
  it("decodes header, spans, and Text", () => {
    const r = decode(`${DOC}${PST}ab[AI:r1{t=${TS}}]cd`);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.text).toBe("abcd");
    expect(r.value.keyCounter).toBe(2);
    expect(r.value.runs).toEqual([
      { runId: "r1", originalLength: 40, editedCount: 3, relabelled: true },
    ]);
    expect(r.value.spans.map((s) => [s.start, s.end, s.provenance.origin])).toEqual([
      [0, 2, "PST"],
      [2, 4, "AI"],
    ]);
    expect(r.value.spans[1]?.provenance.runId).toBe("r1");
    expect(r.value.spans[0]?.provenance).not.toHaveProperty("runId");
  });

  it("decodes the empty Document", () => {
    const r = decode("[DOC{v=1;n=0}]");
    expect(r.ok && r.value.text === "" && r.value.spans.length === 0).toBe(true);
  });

  it("pairs citation, quote, and ref ranges and attaches [OVR]", () => {
    const input =
      `${DOC}${PST}See [CIT ✘{k=k0;why=gone}][OVR:typo{t=${TS}}]410 U.S. 999[/CIT] ` +
      `[QUO ✘{k=k1;p=4}]"x"[/QUO] [REF]5 U.S.C. § 1[/REF]`;
    const r = decode(input);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const [c] = r.value.citations;
    expect(c).toMatchObject({ start: 4, end: 16, key: "k0" });
    expect(c?.status).toEqual({ status: "not_found", reason: "gone" });
    expect(c?.override).toMatchObject({ reason: "typo", timestamp: TS });
    expect(r.value.quotes[0]).toMatchObject({
      start: 17,
      end: 20,
      result: { status: "mismatch", prefixLength: 4 },
    });
    expect(r.value.refs[0]).toMatchObject({ start: 21, end: 33 });
    expect(r.value.refs[0]).not.toHaveProperty("override");
  });

  it("decodes each citation status payload", () => {
    const body = (code: string) => `${DOC}${PST}[${code}]x[/CIT]`;
    const status = (code: string) => {
      const r = decode(body(code));
      return r.ok ? r.value.citations[0]?.status : r.error;
    };
    expect(status("CIT ✓{k=k0;cl=99}")).toEqual({ status: "verified", clusterId: "99" });
    expect(status("CIT ✓{k=k0}")).toEqual({ status: "verified" });
    expect(status("CIT ?:2{k=k0;cs=a,b}")).toEqual({
      status: "ambiguous",
      count: 2,
      candidates: ["a", "b"],
    });
    expect(status(`CIT …{k=k0;wu=${TS}}`)).toEqual({ status: "unchecked", waitUntil: TS });
  });

  it("attaches [OVR] after a quote opener", () => {
    const r = decode(`${DOC}${PST}[QUO …{k=k0}][OVR:why{t=${TS}}]q[/QUO]`);
    expect(r.ok && r.value.quotes[0]?.override?.reason).toBe("why");
  });

  it.each([
    ["[OVR:r{t=" + TS + "}]", "OVR first thing after PST"],
    ["x[OVR:r{t=" + TS + "}]", "OVR after text"],
    [`[REF][OVR:a{t=${TS}}][OVR:b{t=${TS}}][/REF]`, "second OVR on one opener"],
    [`[REF]x[OVR:a{t=${TS}}][/REF]`, "OVR after text inside a range"],
    [`[REF][/REF][OVR:a{t=${TS}}]`, "OVR after a close"],
  ])("rejects a misplaced [OVR]: %#", (tail) => {
    const input = `${DOC}${PST}${tail}`;
    const r = decode(input);
    expect(r.ok ? null : r.error.rule).toBe("ovr_position");
    expect(r.ok ? null : input.slice(r.error.index, r.error.index + 5)).toBe("[OVR:");
  });

  it.each([
    ["[DOC{v=2;n=0}]", "bad version"],
    ["[DOC{v=1;n=01}]", "leading-zero counter"],
    ["[DOC{v=1;n=0;r=a,1,2}]", "short run"],
    ["[DOC{v=1;n=0;r=a,1,2,3}]", "bad run flag"],
  ])("rejects an undecodable header: %s", (doc) => {
    const r = decode(doc);
    expect(r.ok ? null : r.error).toEqual({ index: 0, rule: "bad_field" });
  });

  it.each([
    ["[PST{t=2026-02-30T00:00:00Z}]", "impossible date"],
    ["[CIT ✘{k=7}]x[/CIT]", "bad key"],
    ["[CIT ?:two{k=k0}]x[/CIT]", "non-decimal count"],
    ["[QUO ✘{k=k0;p=-1}]x[/QUO]", "negative prefix"],
    ["[CIT …{k=k0;wu=soon}]x[/CIT]", "bad wait-until"],
  ])("rejects an undecodable field: %s", (code) => {
    const r = decode(`${DOC}${code}`);
    expect(r.ok ? null : r.error).toEqual({ index: DOC.length, rule: "bad_field" });
  });

  it("reports the lowest fault index among several", () => {
    const r = decode(`${DOC}[PST{t=nope}][OVR:a{t=${TS}}]`);
    expect(r.ok ? null : r.error.index).toBe(DOC.length);
  });
});
