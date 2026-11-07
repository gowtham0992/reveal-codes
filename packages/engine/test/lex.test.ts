import { describe, expect, it } from "vitest";
import { lexCodes } from "../src/codes/lex.js";

const DOC = "[DOC{v=1;n=0}]";

describe("codes/lex (_Requirements: 20.3, 20.6_)", () => {
  it("lexes text and codes with Text offsets", () => {
    const r = lexCodes(`${DOC}[PST{t=2026-11-03T10:00:00Z}]a\\[b[CIT …{k=k0}]x[/CIT]`);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const kinds = r.value.map((t) =>
      t.kind === "text" ? t.text : `${t.name}@${String(t.offset)}`,
    );
    expect(kinds).toEqual(["DOC@0", "PST@0", "a[b", "CIT …@3", "x", "/CIT@4"]);
  });

  it.each([
    ["", 0, "missing_doc"],
    [`${DOC}[NOPE]`, DOC.length, "unknown_code"],
    [`${DOC}[PST{t=x}`, DOC.length, "unterminated_code"],
    [`${DOC}[/CIT]`, DOC.length, "unbalanced_close"],
    [`${DOC}[CIT …{k=k0}]`, DOC.length, "unclosed_open"],
    [`${DOC}${DOC}`, DOC.length, "misplaced_doc"],
    [`${DOC}[PST{t=a;t=b}]`, DOC.length, "bad_field"],
    [`${DOC}[PST]`, DOC.length, "bad_field"],
    [`${DOC}a\\`, DOC.length + 1, "dangling_escape"],
    [`${DOC}a\\x`, DOC.length + 1, "dangling_escape"],
  ] as const)("%j faults at %i as %s", (input, index, rule) => {
    const r = lexCodes(input);
    expect(r.ok ? null : r.error).toEqual({ index, rule });
  });

  it("returns the lowest fault index when several exist", () => {
    const r = lexCodes(`${DOC}[/QUO][NOPE]`);
    expect(r.ok ? null : r.error.index).toBe(DOC.length);
  });
});
