import { apply, createDocument } from "@reveal-codes/engine";
import type { Document } from "@reveal-codes/engine";
import { describe, expect, it } from "vitest";
import {
  ORDERS,
  STATEMENT_TITLE,
  buildStatement,
  exportFileName,
  firstPageHeading,
  orderById,
  renderStatement,
} from "../src/index.js";
import type {
  OrderContext,
  OrderElement,
  OrderEntry,
  RunInfo,
  Statement,
  StatementBlock,
} from "../src/index.js";
import { ORDER_ELEMENTS } from "../src/orders-types.js";
import {
  ALL_DRAFTERS_SUFFIX,
  CONFIDENTIALITY_SENTENCE,
  PARAGRAPH_NO_AI,
  RESPONSIBILITY,
  SIGNATURE_LINE,
} from "../src/wording.js";
import {
  DEMO_NOW,
  DEMO_RUN_LOG,
  DEMO_VERIFIED_AT,
  buildDemoDocument,
} from "./support/demo-document.js";

// _Requirements: 4.1-4.23, 5.2, 5.12, 8.1, 8.2, 9.4-9.6, 9.10, 9.12_

const T0 = "2026-01-01T00:00:00.000Z";
const META = { now: DEMO_NOW, verifiedAt: DEMO_VERIFIED_AT };

function must<T>(r: { ok: true; value: T } | { ok: false; error: unknown }): T {
  if (!r.ok) throw new Error("fixture rejected");
  return r.value;
}

function entry(id: string): OrderEntry {
  const e = orderById(ORDERS, id);
  if (e === null) throw new Error(`missing entry ${id}`);
  return e;
}

function withElements(id: string, elements: readonly OrderElement[]): OrderEntry {
  return { ...entry(id), elements };
}

function plain(text: string): Document {
  return must(createDocument(text, T0));
}

/** Typed text, then one real AI insertion for each run id. */
function aiDoc(runIds: readonly string[] = ["r1"]): Document {
  let doc = plain("Typed text.");
  for (const runId of runIds) {
    doc = must(
      apply(doc, {
        kind: "insert",
        at: doc.text.length,
        text: ` Added by ${runId}.`,
        provenance: { origin: "AI", runId, timestamp: T0 },
      }),
    ).document;
  }
  return doc;
}

/** Fourteen paragraphs; paragraphs 12 to 14 are AI text. */
function longAiDoc(): Document {
  const text = Array.from({ length: 14 }, (_, i) => `Paragraph ${String(i + 1)}.`).join("\n");
  const from = text.indexOf("Paragraph 12.");
  return must(
    apply(plain(text), {
      kind: "replace",
      from,
      to: text.length,
      text: text.slice(from),
      provenance: { origin: "AI", runId: "r1", timestamp: T0 },
    }),
  ).document;
}

function logOf(n: number): RunInfo[] {
  return Array.from({ length: n }, (_, i) => ({
    runId: `r${String(i + 1)}`,
    provider: "fixture",
    modelId: "m",
  }));
}

function ctx(e: OrderEntry | null, tick = false): OrderContext {
  return e === null ? null : { entry: e, confidentialityCertified: tick };
}

function stmt(doc: Document, log: readonly RunInfo[], order: OrderContext = null): Statement {
  return must(buildStatement(doc, log, META, order));
}

function paragraphs(blocks: readonly StatementBlock[]): { number: number; text: string }[] {
  return blocks.flatMap((b) =>
    b.kind === "paragraph" ? [{ number: b.number, text: b.text }] : [],
  );
}

/** Text of numbered paragraph `n`. */
function para(s: Statement, n: number): string {
  const found = paragraphs(renderStatement(s)).find((p) => p.number === n);
  if (found === undefined) throw new Error(`no paragraph ${String(n)}`);
  return found.text;
}

const ALL_ENTRIES = ORDERS.entries;

describe("Statement.order for every entry _Requirements: 4.1, 4.2, 4.3_", () => {
  it.each(ALL_ENTRIES.map((e) => [e.id, e] as const))("%s", (_id, e) => {
    const s = stmt(aiDoc(), logOf(1), ctx(e));
    expect(s.order).toEqual({
      id: e.id,
      instrument: e.instrument,
      title: e.title,
      court: e.court.name,
      judge: e.judge === null ? null : e.judge.name,
      date: e.date,
      sourceUrl: e.source_url,
      kind: e.kind,
      caption: e.caption === null ? null : { placement: e.caption.placement, text: e.caption.text },
      elements: [...e.elements],
    });
    expect(s.order?.elements).not.toBe(e.elements);
  });

  it("is null without an order context", () => {
    expect(stmt(aiDoc(), logOf(1)).order).toBeNull();
    expect(stmt(aiDoc(), logOf(1), null).order).toBeNull();
  });
});

describe("paragraph numbering _Requirements: 4.4, 4.7_", () => {
  it("gives every entry exactly one more paragraph than no order, shifted by one", async () => {
    const demo = await buildDemoDocument();
    const docs: readonly (readonly [Document, readonly RunInfo[]])[] = [
      [plain("No AI here."), []],
      [aiDoc(), logOf(1)],
      [demo, DEMO_RUN_LOG],
    ];
    for (const [doc, log] of docs) {
      const base = renderStatement(stmt(doc, log));
      const basePs = paragraphs(base);
      for (const e of ALL_ENTRIES) {
        const blocks = renderStatement(stmt(doc, log, ctx(e)));
        const ps = paragraphs(blocks);
        expect(
          ps.map((p) => p.number),
          e.id,
        ).toEqual(ps.map((_p, i) => i + 1));
        expect(ps.length, e.id).toBe(basePs.length + 1);
        // Paragraphs after the AI paragraph are the old ones, one number higher.
        expect(ps.slice(3), e.id).toEqual(
          basePs.slice(2).map((p) => ({ ...p, number: p.number + 1 })),
        );
        expect(
          blocks.filter((b) => b.kind === "table"),
          e.id,
        ).toEqual(base.filter((b) => b.kind === "table"));
      }
    }
  });
});

describe("citing sentence _Requirements: 4.7, 4.8_", () => {
  it("is exact for a Judge_Entry with a statement_title caption (edtex-love-2025)", () => {
    const s = stmt(aiDoc(), logOf(1), ctx(entry("edtex-love-2025")));
    expect(para(s, 1)).toBe(
      "This statement is made to comply with the following instrument of the United States District Court for the Eastern District of Texas: Standing Order on Disclosure and Certification Requirements for Use of Generative Artificial Intelligence (Standing order, Judge John D. Love, 2025-04-09). Source: https://coop.txed.uscourts.gov/sites/default/files/judgeFiles/JDL%20Standing%20Order%20on%20AI%204.9.25.pdf.",
    );
  });

  it("is exact for a Court_Wide_Entry (ndtex-lr-7-2-f), with no judge clause", () => {
    const s = stmt(aiDoc(), logOf(1), ctx(entry("ndtex-lr-7-2-f")));
    expect(para(s, 1)).toBe(
      "This statement is made to comply with the following instrument of the United States District Court for the Northern District of Texas: Disclosure of Use of Generative Artificial Intelligence (Local Civil Rule 7.2(f); Local Criminal Rule 47.2(e), 2024-09-03). Source: https://www.txnd.uscourts.gov/sites/default/files/orders/2-98.pdf.",
    );
  });

  it("ends the declaration clause without doubling the full stop (dhaw-go-23-1)", () => {
    const s = stmt(aiDoc(), logOf(1), ctx(entry("dhaw-go-23-1")));
    const text = para(s, 1);
    expect(text).toBe(
      'This statement is made to comply with the following instrument of the United States District Court for the District of Hawaii: In re: Use of Unverified Sources (General Order 23-1, 2023-11-14), filed as a declaration captioned "Reliance on Unverified Source". Source: https://www.hid.uscourts.gov/cms/assets/23a3ee72-c96c-42c4-b184-e8a748a00f64/General%20Order%20on%20the%20Use%20of%20Unverified%20Sources.pdf.',
    );
    expect(text).not.toContain("..");
    expect(text).not.toContain(". ,");
  });
});

describe("titles _Requirements: 4.5, 4.6, 9.4, 9.5_", () => {
  it("keeps the Standard_Title and adds the first-page heading under ndtex-lr-7-2-f with AI", () => {
    const s = stmt(aiDoc(), logOf(1), ctx(entry("ndtex-lr-7-2-f")));
    expect(renderStatement(s)[0]).toEqual({ kind: "title", text: STATEMENT_TITLE });
    expect(firstPageHeading(s)).toEqual({
      heading: "Use of Generative Artificial Intelligence",
      pointer:
        "This filing was prepared using generative artificial intelligence. See the AI-Use and Verification Statement following the filing.",
    });
  });

  it("has no first-page heading under ndtex-lr-7-2-f without AI", () => {
    const s = stmt(plain("No AI."), [], ctx(entry("ndtex-lr-7-2-f")));
    expect(firstPageHeading(s)).toBeNull();
    expect(renderStatement(s)[0]).toEqual({ kind: "title", text: STATEMENT_TITLE });
  });

  it("uses the caption as the title under edtex-love-2025", () => {
    const s = stmt(aiDoc(), logOf(1), ctx(entry("edtex-love-2025")));
    expect(renderStatement(s)[0]).toEqual({
      kind: "title",
      text: "Certificate of Generative Artificial Intelligence Usage",
    });
  });

  it("uses the Standard_Title when the entry has no caption", () => {
    const s = stmt(aiDoc(), logOf(1), ctx(entry("cit-choe-groves-2025")));
    expect(renderStatement(s)[0]).toEqual({ kind: "title", text: STATEMENT_TITLE });
  });
});

describe("tool sentence under edtex-love-2025 _Requirements: 4.9, 4.10, 9.5_", () => {
  const love = entry("edtex-love-2025");
  const lead = "The generative artificial intelligence program used";

  it("names one tool with its model", () => {
    const s = stmt(aiDoc(), logOf(1), ctx(love));
    expect(para(s, 3)).toContain(`${lead} was fixture m.`);
  });

  it("joins two tools with a semicolon", () => {
    const log: RunInfo[] = [
      { runId: "r1", provider: "fixture", modelId: "m-1" },
      { runId: "r2", provider: "bedrock", modelId: "m-2" },
    ];
    const s = stmt(aiDoc(["r1", "r2"]), log, ctx(love));
    expect(para(s, 3)).toContain(`${lead} was fixture m-1; bedrock m-2.`);
  });

  it("writes the provider alone for a null model", () => {
    const log: RunInfo[] = [{ runId: "r1", provider: "fixture", modelId: null }];
    const s = stmt(aiDoc(), log, ctx(love));
    expect(para(s, 3)).toContain(`${lead} was fixture.`);
    expect(para(s, 3)).not.toContain("fixture null");
  });

  it("says no tool is recorded when there is none", () => {
    const s = stmt(aiDoc(), [], ctx(love));
    expect(para(s, 3)).toContain(`${lead} is not recorded.`);
  });

  it("adds the no-program sentence to the no-AI paragraph", () => {
    const s = stmt(plain("No AI."), [], ctx(love));
    expect(para(s, 3)).toBe(`${PARAGRAPH_NO_AI} No program was used.`);
  });
});

describe("no AI under dcolo-wang-2025 _Requirements: 4.16, 4.17, 9.6_", () => {
  const wang = entry("dcolo-wang-2025");

  it("renders the no-AI sentence and the all-drafters signature line", () => {
    const blocks = renderStatement(stmt(plain("No AI."), [], ctx(wang)));
    expect(paragraphs(blocks)[2]?.text).toBe(
      "No generative artificial intelligence was used in preparing this filing.",
    );
    const sig = blocks.at(-1);
    expect(sig).toMatchObject({
      kind: "signature",
      line: "/s/ ________________ (all contributors to the drafting)",
    });
    expect(SIGNATURE_LINE + ALL_DRAFTERS_SUFFIX).toBe(
      "/s/ ________________ (all contributors to the drafting)",
    );
  });

  it("keeps the all-drafters signature line when AI was used", () => {
    const blocks = renderStatement(stmt(aiDoc(), logOf(1), ctx(wang)));
    expect(blocks.at(-1)).toMatchObject({
      line: "/s/ ________________ (all contributors to the drafting)",
    });
  });

  it("keeps the plain signature line for an entry without the element", () => {
    const blocks = renderStatement(stmt(aiDoc(), logOf(1), ctx(entry("edtex-love-2025"))));
    expect(blocks.at(-1)).toMatchObject({ line: "/s/ ________________" });
  });
});

describe("element sentences and run counts _Requirements: 4.11, 4.12, 4.15_", () => {
  const RUN_NOUN: readonly (readonly [number, string])[] = [
    [0, "runs"],
    [1, "run"],
    [3, "runs"],
  ];

  it.each(RUN_NOUN)("how_used with %i run(s)", (n, noun) => {
    const e = withElements("edtex-love-2025", ["how_used"]);
    const base = para(stmt(aiDoc(), logOf(n)), 2);
    const s = stmt(aiDoc(), logOf(n), ctx(e));
    expect(para(s, 3)).toBe(
      `${base} The program was used to draft text inserted at the author's request in ${String(n)} ${noun}; each prompt is recorded in the run log.`,
    );
  });

  it.each(RUN_NOUN)("prompt_records with %i run(s)", (n) => {
    const e = withElements("edtex-love-2025", ["prompt_records"]);
    const base = para(stmt(aiDoc(), logOf(n)), 2);
    const s = stmt(aiDoc(), logOf(n), ctx(e));
    expect(para(s, 3)).toBe(
      `${base} Prompt records are retained in the document's run log (${String(n)} prompts).`,
    );
  });

  it("portions lists the paragraph range with an en dash", () => {
    const e = withElements("edtex-love-2025", ["portions"]);
    const base = para(stmt(longAiDoc(), logOf(1)), 2);
    const s = stmt(longAiDoc(), logOf(1), ctx(e));
    expect(para(s, 3)).toBe(
      `${base} The text drafted with the program appears at paragraphs 12\u201314 of the filing.`,
    );
  });

  it("adds none of them to the no-AI paragraph", () => {
    const e = withElements("edtex-love-2025", [
      "portions",
      "how_used",
      "confidentiality",
      "prompt_records",
    ]);
    expect(para(stmt(plain("No AI."), logOf(3), ctx(e, true)), 3)).toBe(PARAGRAPH_NO_AI);
  });

  it("never writes the word lines in the AI paragraph, for any entry", () => {
    for (const e of ALL_ENTRIES) {
      const all: OrderEntry = { ...e, elements: ORDER_ELEMENTS };
      const text = para(stmt(longAiDoc(), logOf(1), ctx(all, true)), 3);
      expect(text, e.id).toContain("appears at paragraphs 12\u201314 of the filing.");
      expect(text, e.id).not.toMatch(/\blines?\b/i);
    }
  });
});

describe("confidentiality under cit-choe-groves-2025 _Requirements: 4.14_", () => {
  const choe = entry("cit-choe-groves-2025");

  it("adds the sentence when ticked", () => {
    const s = stmt(aiDoc(), logOf(1), ctx(choe, true));
    expect(s.confidentialityCertified).toBe(true);
    expect(para(s, 3)).toContain(CONFIDENTIALITY_SENTENCE);
    expect(CONFIDENTIALITY_SENTENCE).toBe(
      "The author certifies that no confidential or business proprietary information was entered into the program.",
    );
  });

  it("omits the sentence when not ticked", () => {
    const s = stmt(aiDoc(), logOf(1), ctx(choe, false));
    expect(s.confidentialityCertified).toBe(false);
    expect(para(s, 3)).not.toContain("confidential");
  });

  it("omits the sentence when ticked but no AI was used", () => {
    const s = stmt(plain("No AI."), [], ctx(choe, true));
    expect(para(s, 3)).not.toContain("confidential");
  });

  it("omits the sentence for an entry without the element, even when ticked", () => {
    const s = stmt(aiDoc(), logOf(1), ctx(entry("edtex-love-2025"), true));
    expect(para(s, 3)).not.toContain("confidential");
  });
});

describe("verification-only elements _Requirements: 4.13, 9.10_", () => {
  const ELEMENTS = ["accuracy_certification", "citations_verified", "human_review"] as const;
  const docs: readonly (readonly [string, Document, readonly RunInfo[]])[] = [
    ["AI used", aiDoc(), logOf(1)],
    ["no AI", plain("No AI."), []],
  ];

  it.each(ELEMENTS.flatMap((el) => docs.map(([name, d, l]) => [el, name, d, l] as const)))(
    "%s adds no sentence and keeps the verification sentences (%s)",
    (el, _name, doc, log) => {
      const bare = renderStatement(stmt(doc, log, ctx(withElements("edtex-love-2025", []))));
      const blocks = renderStatement(stmt(doc, log, ctx(withElements("edtex-love-2025", [el]))));
      expect(blocks).toEqual(bare);
      const texts = paragraphs(blocks).map((p) => p.text);
      expect(
        texts.some((t) => t.startsWith("Every legal citation in this filing was checked")),
      ).toBe(true);
      expect(texts.some((t) => t.startsWith("Quotations attributed to a cited decision"))).toBe(
        true,
      );
      expect(texts).toContain(RESPONSIBILITY);
    },
  );

  it("keeps the verification sentences under every shipped entry", () => {
    for (const e of ALL_ENTRIES) {
      const texts = paragraphs(renderStatement(stmt(aiDoc(), logOf(1), ctx(e)))).map((p) => p.text);
      expect(
        texts.some((t) => t.startsWith("Every legal citation")),
        e.id,
      ).toBe(true);
      expect(
        texts.some((t) => t.startsWith("Quotations attributed")),
        e.id,
      ).toBe(true);
      expect(texts, e.id).toContain(RESPONSIBILITY);
    }
  });
});

describe("serialisation, file name and determinism _Requirements: 4.3, 4.21, 4.23, 8.1, 8.2_", () => {
  it("survives a JSON round trip for every entry", () => {
    for (const e of ALL_ENTRIES) {
      const s = stmt(aiDoc(), logOf(1), ctx(e, true));
      expect(JSON.parse(JSON.stringify(s)) as unknown, e.id).toEqual(s);
    }
  });

  it("renders a structured clone to the same blocks for every entry", () => {
    for (const e of ALL_ENTRIES) {
      const s = stmt(longAiDoc(), logOf(2), ctx(e, true));
      expect(renderStatement(structuredClone(s)), e.id).toEqual(renderStatement(s));
    }
  });

  it("gives the same file name for every entry", () => {
    const doc = aiDoc();
    const expected = exportFileName(stmt(doc, logOf(1)).caption, DEMO_NOW);
    for (const e of ALL_ENTRIES) {
      expect(exportFileName(stmt(doc, logOf(1), ctx(e)).caption, DEMO_NOW), e.id).toBe(expected);
    }
  });

  it("is deterministic for every entry", () => {
    for (const e of ALL_ENTRIES) {
      expect(stmt(longAiDoc(), logOf(2), ctx(e, true)), e.id).toEqual(
        stmt(longAiDoc(), logOf(2), ctx(e, true)),
      );
    }
  });
});
