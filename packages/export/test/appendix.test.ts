import { createDocument, render } from "@reveal-codes/engine";
import type { Document } from "@reveal-codes/engine";
import { describe, expect, it } from "vitest";
import { buildAppendix } from "../src/appendix.js";
import { buildAppendix as exported } from "../src/index.js";
import { APPENDIX_INTRO_1, APPENDIX_INTRO_2 } from "../src/wording.js";
import { buildDemoDocument } from "./support/demo-document.js";

const AT = "2026-11-20T18:25:00.000Z";

function doc(text: string): Document {
  const r = createDocument(text, AT);
  if (!r.ok) throw new Error(r.error.kind);
  return r.value;
}

describe("buildAppendix", () => {
  it("has the title and the two introductory sentences", () => {
    const a = buildAppendix(doc("x"));
    expect(a.title).toBe("Provenance Appendix");
    expect(a.intro).toEqual([APPENDIX_INTRO_1, APPENDIX_INTRO_2]);
  });

  it("is re-exported from the package index", () => {
    expect(exported).toBe(buildAppendix);
  });

  it("yields the [DOC] header line only for an empty Document", () => {
    const d = doc("");
    const a = buildAppendix(d);
    expect(a.lines).toEqual(render(d, "full").text.split("\n"));
    expect(a.lines).toHaveLength(1);
    expect(a.lines[0]?.startsWith("[DOC")).toBe(true);
  });

  it("keeps leading and trailing spaces and empty lines unmodified", () => {
    const d = doc("  lead\n\n  trail  \n");
    const a = buildAppendix(d);
    expect(a.lines.join("\n")).toBe(render(d, "full").text);
    expect(a.lines.some((l) => l === "")).toBe(true);
    expect(a.lines.some((l) => l.includes("  lead"))).toBe(true);
    expect(a.lines.some((l) => l.includes("  trail  "))).toBe(true);
  });

  it("joins the Demo_Document lines to its full rendering", async () => {
    const demo = await buildDemoDocument();
    expect(buildAppendix(demo).lines.join("\n")).toBe(render(demo, "full").text);
  });

  it("is deterministic for deeply equal Documents", () => {
    expect(buildAppendix(doc("same"))).toEqual(buildAppendix(doc("same")));
  });
});
