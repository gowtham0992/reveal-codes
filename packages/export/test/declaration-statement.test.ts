import { apply, createDocument } from "@reveal-codes/engine";
import type { Declaration, Document, Provenance } from "@reveal-codes/engine";
import { describe, expect, it } from "vitest";
import {
  ORDERS,
  buildDocx,
  buildStatement,
  canExport,
  firstPageHeading,
  orderById,
  prohibitionNotice,
  renderStatement,
} from "../src/index.js";
import type { OrderContext, OrderElement, OrderEntry, RunInfo, Statement } from "../src/index.js";
import { aiFor, noneFor } from "./support/declarations.js";
import { readDocxPart, readDocxParagraphs } from "./support/docx-text.js";

// _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.11, 2.12, 6.6, 6.7, 7.1, 7.5, 7.6, 12.1, 12.2, 12.3, 12.4, 12.5_

const T0 = "2026-01-01T00:00:00.000Z";
const META = { now: new Date("2026-11-20T18:25:00.000Z"), verifiedAt: null } as const;
const TOOL = "ChatGPT (GPT-4o)";

const HUM: Provenance = { origin: "HUM", timestamp: T0 };
const PST: Provenance = { origin: "PST", timestamp: T0 };
const AI: Provenance = { origin: "AI", runId: "r1", timestamp: T0 };
const LOG: readonly RunInfo[] = [{ runId: "r1", provider: "bedrock", modelId: "m" }];

const TYPED_ONLY =
  "The record shows that every character was typed in the editor and that the editor's assistant was not used.";
const TYPED_AND_PASTED =
  "The record shows that the editor's assistant was not used. Of the 19 characters of this filing, 7 (36.8%) were typed in the editor and 12 (63.2%) were pasted or imported; the tool did not record the origin of the pasted or imported text.";
const NONE_PASTED = "The author states that no generative AI was used to prepare the pasted text.";
const NONE_FILING = "The author states that no generative AI was used to prepare this filing.";
const AI_PASTED = `The author states that generative AI was used to prepare some or all of the pasted text, and names the tool as ${TOOL}. The tool did not record which pasted passages.`;
const AI_FILING = `The author states that generative AI was used to prepare some or all of this filing, and names the tool as ${TOOL}. The tool did not record which passages.`;
const PROGRAM_AS_NAMED = `The generative artificial intelligence program used was ${TOOL}, as named by the author.`;
const HEADING = "Use of Generative Artificial Intelligence";
const POINTER =
  "This filing was prepared using generative artificial intelligence. See the AI-Use and Verification Statement following the filing.";

function must<T>(r: { ok: true; value: T } | { ok: false; error: unknown }): T {
  if (!r.ok) throw new Error(`fixture rejected: ${JSON.stringify(r.error)}`);
  return r.value;
}

/** A Document built from (provenance, text) pieces, in order. */
function docOf(...pieces: readonly (readonly [Provenance, string])[]): Document {
  let doc = must(createDocument("", T0));
  for (const [provenance, text] of pieces) {
    doc = must(apply(doc, { kind: "insert", at: doc.text.length, text, provenance })).document;
  }
  return doc;
}

const typed = (): Document => docOf([HUM, "Typed text."]);
const pasted = (): Document => docOf([HUM, "Typed. "], [PST, "Pasted text."]);
const assistant = (): Document => docOf([HUM, "Typed. "], [AI, "Drafted by the tool."]);
const assistantAndPasted = (): Document =>
  docOf([HUM, "Typed. "], [AI, "Drafted by the tool."], [PST, "Pasted text."]);

function entry(id: string): OrderEntry {
  const e = orderById(ORDERS, id);
  if (e === null) throw new Error(`missing entry ${id}`);
  return e;
}

function withElements(id: string, elements: readonly OrderElement[]): OrderEntry {
  return { ...entry(id), elements };
}

function ctx(e: OrderEntry | null): OrderContext {
  return e === null ? null : { entry: e, confidentialityCertified: false };
}

function stmt(
  doc: Document,
  e: OrderEntry | null,
  stored: Declaration | null,
  log: readonly RunInfo[] = [],
): Statement {
  return must(buildStatement(doc, log, META, ctx(e), stored));
}

/** Paragraph 2 of the statement, which is paragraph 3 when an order's citing paragraph leads. */
function para(s: Statement): string {
  const wanted = s.order === null ? 2 : 3;
  const found = renderStatement(s).find((b) => b.kind === "paragraph" && b.number === wanted);
  if (found === undefined || found.kind !== "paragraph") throw new Error("no paragraph");
  return found.text;
}

describe("paragraph 2 cases _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.11, 2.12, 12.1_", () => {
  const ASSISTANT =
    "Generative artificial intelligence was used in preparing this filing. Tools: bedrock: m. Text inserted by the tool accounts for 20 of 27 characters (74.1%); of that, 0 characters were subsequently edited by the author.";

  it("assistant text without pasted text prints the AI paragraph only", () => {
    expect(para(stmt(assistant(), null, null, LOG))).toBe(ASSISTANT);
  });

  it("assistant text with pasted text adds the pasted sentence and the declaration", () => {
    const text = para(stmt(assistantAndPasted(), null, noneFor("pasted_text"), LOG));
    expect(text).toBe(
      "Generative artificial intelligence was used in preparing this filing. Tools: bedrock: m. Text inserted by the tool accounts for 20 of 39 characters (51.3%); of that, 0 characters were subsequently edited by the author. " +
        `12 of 39 characters (30.8%) were pasted or imported; the tool did not record their origin. ${NONE_PASTED}`,
    );
  });

  it("typed text only with no order prints the record sentence and no declaration", () => {
    const s = stmt(typed(), null, null);
    expect(para(s)).toBe(TYPED_ONLY);
    expect(s.declaration).toBeNull();
    expect(s.aiUsed).toBe(false);
  });

  it("typed text only under an order that requires a statement, declaration None", () => {
    const s = stmt(typed(), entry("ndtex-lr-7-2-f"), noneFor("this_filing"));
    expect(para(s)).toBe(`${TYPED_ONLY} ${NONE_FILING}`);
  });

  it("typed text only under an order that requires a statement, Declared_AI", () => {
    const s = stmt(typed(), entry("ndtex-lr-7-2-f"), aiFor("this_filing"));
    expect(para(s)).toBe(`${TYPED_ONLY} ${AI_FILING}`);
    expect(s.aiUsed).toBe(true);
  });

  it("substantive pasted text with no assistant text, declaration None", () => {
    expect(para(stmt(pasted(), null, noneFor("pasted_text")))).toBe(
      `${TYPED_AND_PASTED} ${NONE_PASTED}`,
    );
  });

  it("substantive pasted text with no assistant text, Declared_AI", () => {
    expect(para(stmt(pasted(), null, aiFor("pasted_text")))).toBe(
      `${TYPED_AND_PASTED} ${AI_PASTED}`,
    );
  });

  it("whitespace-only pasted text with no order prints the counts and no Author_Sentence", () => {
    const doc = docOf([HUM, "Typed."], [PST, "   "]);
    const s = stmt(doc, null, null);
    expect(s.declaration).toBeNull();
    expect(para(s)).toBe(
      "The record shows that the editor's assistant was not used. Of the 9 characters of this filing, 6 (66.7%) were typed in the editor and 3 (33.3%) were pasted or imported; the tool did not record the origin of the pasted or imported text.",
    );
    expect(para(s)).not.toContain("The author states that");
  });
});

describe("Declared_AI pasted text under each Order_Entry kind _Requirements: 7.1, 7.5, 7.6, 12.2_", () => {
  const declared = aiFor("pasted_text");
  const base = `${TYPED_AND_PASTED} ${AI_PASTED}`;

  it("certification_every_filing (edtex-love-2025) names the tool and says how_used was not recorded", () => {
    const s = stmt(pasted(), entry("edtex-love-2025"), declared);
    expect(entry("edtex-love-2025").kind).toBe("certification_every_filing");
    expect(para(s)).toBe(
      `${base} ${PROGRAM_AS_NAMED} The tool did not record how generative AI was used to prepare the pasted text.`,
    );
  });

  it("disclosure_when_used (sdohio-graham-2025) names the tool and says portions were not recorded", () => {
    const s = stmt(pasted(), entry("sdohio-graham-2025"), declared);
    expect(entry("sdohio-graham-2025").kind).toBe("disclosure_when_used");
    expect(para(s)).toBe(
      `${base} ${PROGRAM_AS_NAMED} The author states that generative AI was used to prepare some or all of the pasted text; the tool did not record which passages.`,
    );
  });

  it("prompt_records says the tool holds no prompt records", () => {
    const e = withElements("edtex-love-2025", ["prompt_records"]);
    expect(para(stmt(pasted(), e, declared))).toBe(
      `${base} The tool holds no prompt records for the pasted text.`,
    );
  });

  it.each(["edtex-lr-cv-11-g", "sdtex-go-2025-04"])(
    "%s adds only the declaration sentence",
    (id) => {
      expect(["verification_only", "guidance"]).toContain(entry(id).kind);
      expect(para(stmt(pasted(), entry(id), declared))).toBe(base);
    },
  );

  it("prohibition (sdohio-newman) refuses export and prints the declared line", () => {
    const e = entry("sdohio-newman");
    expect(e.kind).toBe("prohibition");
    expect(canExport(pasted(), e, declared)).toBe(false);
    expect(canExport(pasted(), e, noneFor("pasted_text"))).toBe(true);
    expect(prohibitionNotice(pasted(), e, declared)?.line).toBe(
      "Judge Newman's order prohibits AI-drafted text. The author declared that generative AI was used to prepare the pasted text.",
    );
  });
});

describe("typed-only filing under a statement-requiring order _Requirements: 2.5, 2.7, 7.6, 12.3_", () => {
  const love = entry("edtex-love-2025");

  it("this_filing None adds the author's no-AI sentence and no program sentence", () => {
    expect(para(stmt(typed(), love, noneFor("this_filing")))).toBe(`${TYPED_ONLY} ${NONE_FILING}`);
  });

  it("this_filing Declared_AI names the tool as the author's and says how_used was not recorded", () => {
    const s = stmt(typed(), love, aiFor("this_filing"));
    expect(para(s)).toBe(
      `${TYPED_ONLY} ${AI_FILING} ${PROGRAM_AS_NAMED} The tool did not record how generative AI was used to prepare this filing.`,
    );
  });
});

describe("tool sentences with assistant text _Requirements: 7.5, 12.2_", () => {
  const love = entry("edtex-love-2025");

  it("joins the recorded tools to the author's name", () => {
    const s = stmt(assistantAndPasted(), love, aiFor("pasted_text"), LOG);
    expect(para(s)).toContain(
      `The generative artificial intelligence program used was bedrock m; the author names ${TOOL} for the pasted text.`,
    );
  });

  it("programWithAuthor variant with no recorded tool", () => {
    const s = stmt(assistantAndPasted(), love, aiFor("pasted_text"), []);
    expect(para(s)).toContain(
      `The generative artificial intelligence program used is not recorded; the author names ${TOOL} for the pasted text.`,
    );
  });
});

describe("tool name printing _Requirements: 2.8, 12.5_", () => {
  it("prints ChatGPT (GPT-4o) unchanged, with nothing added around it", () => {
    const text = para(stmt(pasted(), null, aiFor("pasted_text", TOOL)));
    expect(text).toContain(`names the tool as ${TOOL}. The tool did not`);
    expect(text).not.toMatch(/["\u201c(]ChatGPT \(GPT-4o\)[)"\u201d]/);
  });

  it("prints a tool name after trimming it", () => {
    const stored: Declaration = {
      subject: "pasted_text",
      choice: "declared_ai",
      toolName: `  ${TOOL}  `,
    };
    expect(para(stmt(pasted(), null, stored))).toContain(
      `names the tool as ${TOOL}. The tool did not`,
    );
  });
});

describe("buildStatement error values _Requirements: 2.13, 12.1_", () => {
  const build = (doc: Document, e: OrderEntry | null, stored: Declaration | null) =>
    buildStatement(doc, [], META, ctx(e), stored);

  it("declaration_required for substantive pasted text with no declaration", () => {
    expect(build(pasted(), null, null)).toEqual({
      ok: false,
      error: { kind: "declaration_required", subject: "pasted_text" },
    });
  });

  it("declaration_required for a typed filing under a statement-requiring order", () => {
    expect(build(typed(), entry("ndtex-lr-7-2-f"), null)).toEqual({
      ok: false,
      error: { kind: "declaration_required", subject: "this_filing" },
    });
  });

  it("a Declaration made for the other subject does not answer", () => {
    expect(build(pasted(), null, noneFor("this_filing"))).toEqual({
      ok: false,
      error: { kind: "declaration_required", subject: "pasted_text" },
    });
  });

  it.each([
    ["x", "too_short"],
    ["   ", "too_short"],
    ["y".repeat(101), "too_long"],
    ["two\nlines", "control_character"],
  ] as const)("invalid_tool_name for %j is %s", (toolName, fault) => {
    const stored: Declaration = { subject: "pasted_text", choice: "declared_ai", toolName };
    expect(build(pasted(), null, stored)).toEqual({
      ok: false,
      error: { kind: "invalid_tool_name", fault },
    });
  });
});

describe("prohibition lines _Requirements: 6.6, 6.7_", () => {
  const newman = entry("sdohio-newman");
  const doc = docOf([PST, "Pasted text.\n"], [AI, "Drafted by the tool."]);
  const LINE =
    'Judge Newman\'s order prohibits AI-drafted text. 1 AI-origin passage remains: paragraph 2, beginning "Drafted by the tool.\u2026".';

  it("assistant text alone prints the existing line", () => {
    expect(prohibitionNotice(doc, newman, noneFor("pasted_text"))?.line).toBe(LINE);
  });

  it("assistant text plus Declared_AI pasted text appends the author's sentence", () => {
    const notice = prohibitionNotice(doc, newman, aiFor("pasted_text"));
    expect(notice?.line).toBe(
      `${LINE} The author also declared that generative AI was used to prepare the pasted text.`,
    );
    expect(canExport(doc, newman, aiFor("pasted_text"))).toBe(false);
    expect(canExport(doc, newman, null)).toBe(false);
  });

  it("a declaration alone prints the declared line for this_filing too", () => {
    const e = withElements("sdohio-newman", ["negative_certification_when_unused"]);
    expect(prohibitionNotice(typed(), e, aiFor("this_filing"))?.line).toBe(
      "Judge Newman's order prohibits AI-drafted text. The author declared that generative AI was used to prepare this filing.",
    );
  });
});

describe("N.D. Tex. first-page heading with Declared_AI pasted text _Requirements: 7.1, 12.4_", () => {
  const ndtex = entry("ndtex-lr-7-2-f");

  it("gives the first-page heading and writes it into the DOCX header", async () => {
    const doc = pasted();
    const s = stmt(doc, ndtex, aiFor("pasted_text"));
    expect(firstPageHeading(s)).toEqual({ heading: HEADING, pointer: POINTER });
    const bytes = await buildDocx(doc, s);
    expect(readDocxPart(bytes, "word/document.xml")).toContain("<w:titlePg");
    const header = readDocxPart(bytes, "word/header1.xml");
    expect(header).toContain(HEADING);
    expect(header).toContain(POINTER);
    expect(readDocxParagraphs(bytes).some((p) => p.includes(`names the tool as ${TOOL}.`))).toBe(
      true,
    );
  });

  it("gives no heading when the author declares None", async () => {
    const doc = pasted();
    const s = stmt(doc, ndtex, noneFor("pasted_text"));
    expect(firstPageHeading(s)).toBeNull();
    expect(readDocxPart(await buildDocx(doc, s), "word/document.xml")).not.toContain("w:titlePg");
  });
});
