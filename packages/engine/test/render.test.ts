import { describe, expect, it } from "vitest";
import { createDocument } from "../src/document.js";
import { render } from "../src/codes/render.js";

const TS = "2026-11-03T10:00:00Z";

function mustDoc(text: string) {
  const r = createDocument(text, TS);
  if (!r.ok) throw new Error("createDocument failed");
  return r.value;
}

describe("render (Req 19.9)", () => {
  it("renders an empty Document as only [DOC] in full mode", () => {
    const out = render(mustDoc(""), "full");
    expect(out.text).toBe("[DOC{v=1;n=0}]");
    expect(out.positions).toEqual([{ offset: 0, code: "[DOC{v=1;n=0}]" }]);
  });

  it("renders an empty Document as nothing in display mode", () => {
    expect(render(mustDoc(""), "display")).toEqual({ text: "", positions: [] });
  });
});

describe("render (Req 19.1, 19.3, 19.10)", () => {
  it("escapes brackets and wraps a citation in full and display modes", () => {
    const doc = mustDoc("See 410 U.S. 113 [x]");
    const full = render(doc, "full");
    const display = render(doc, "display");
    expect(full.text).toBe(
      `[DOC{v=1;n=1}][PST{t=${TS}}]See [CIT …{k=k0}]410 U.S. 113[/CIT] \\[x\\]`,
    );
    expect(display.text).toBe("[PST]See [CIT …]410 U.S. 113[/CIT] \\[x\\]");
    expect(display.positions.map((p) => p.offset)).toEqual([0, 4, 16]);
  });
});
