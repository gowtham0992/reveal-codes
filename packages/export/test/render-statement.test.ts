import { describe, expect, it } from "vitest";
import { renderStatement } from "../src/index.js";
import type { Statement, StatementBlock } from "../src/index.js";
import { buildDemoDocumentStatement } from "./support/demo-statement.js";

const ZERO = { HUM: 0, PST: 0, AI: 0, "AI>HUM": 0 } as const;
const REASON = "Authority is cited for background only and will be removed.";

function base(over: Partial<Statement> = {}): Statement {
  return {
    aiUsed: false,
    tools: [],
    characters: ZERO,
    sentences: { total: 0, byDominantOrigin: ZERO },
    citations: [],
    quotes: [],
    overrides: [],
    generatedAt: "2026-03-05T02:30:00.000Z",
    generatedDate: "2026-03-04",
    verifiedAt: "2026-03-05T02:30:00.000Z",
    verifiedDate: "2026-03-04",
    caption: "",
    order: null,
    aiPassages: [],
    runCount: 0,
    confidentialityCertified: false,
    ...over,
  };
}

function paragraphs(blocks: readonly StatementBlock[]): string[] {
  return blocks.flatMap((b) => (b.kind === "paragraph" ? [`${String(b.number)}. ${b.text}`] : []));
}

function aiParagraph(ai: number, edited: number, total: number): string {
  const s = base({
    aiUsed: true,
    tools: [{ provider: "p", model: null }],
    characters: { HUM: total - ai - edited, PST: 0, AI: ai, "AI>HUM": edited },
  });
  return paragraphs(renderStatement(s))[1] ?? "";
}

describe("renderStatement on the Demo_Document", () => {
  it("renders the exact blocks", async () => {
    const { blocks } = await buildDemoDocumentStatement();
    const long =
      "a pro se plaintiff who alleges retaliation is entitled to discovery before a motion to dismiss may be granted.";
    expect(blocks).toEqual([
      { kind: "title", text: "AI-Use and Verification Statement" },
      {
        kind: "paragraph",
        number: 1,
        text: "This filing was prepared with the drafting tool Reveal Codes, which records the origin of every character.",
      },
      {
        kind: "paragraph",
        number: 2,
        text: "Generative artificial intelligence was used in preparing this filing. Tools: a recorded demonstration response (no model was called). Text inserted by the tool accounts for 48 of 2619 characters (1.8%); of that, 0 characters were subsequently edited by the author.",
      },
      {
        kind: "paragraph",
        number: 3,
        text: "Every legal citation in this filing was checked against the CourtListener database on 2026-11-20. 2 resolved to a single reported decision, 3 could not be found, 0 matched more than one decision, and 0 were not checked.",
      },
      {
        kind: "table",
        columns: ["Citation", "Status", "Cluster id"],
        rows: [
          ["556 U.S. 662, 678 (2009)", "CIT ✓", "145875"],
          ["404 U.S. 519, 520 (1972)", "CIT ✓", "108432"],
          ["1047 F.3d 212, 219 (9th Cir. 2019)", "CIT ✘", ""],
          ["1012 F. Supp. 2d 88, 95 (D. Or. 2015)", "CIT ✘", ""],
          ["912 F. 4th 33, 41 (9th Cir. 2023)", "CIT ✘", ""],
        ],
      },
      {
        kind: "paragraph",
        number: 4,
        text: "Quotations attributed to a cited decision were compared with the text of that decision. 1 matched, 1 did not, 0 were not checked.",
      },
      {
        kind: "table",
        columns: ["Quotation", "Status"],
        rows: [
          ["less stringent standards than formal pleadings drafted by lawyers", "QUO ✓"],
          [`${long.slice(0, 79)}…`, "QUO ✘"],
        ],
      },
      {
        kind: "paragraph",
        number: 5,
        text: "The author chose to file despite the following unresolved items, for the reasons stated:",
      },
      {
        kind: "table",
        columns: ["Code", "Text", "Reason", "Timestamp"],
        rows: [
          [
            "CIT ✘",
            "1047 F.3d 212, 219 (9th Cir. 2019)",
            "Cited from the client's court notice; copy requested from the clerk.",
            "2026-11-20 10:25",
          ],
          [
            "CIT ✘",
            "1012 F. Supp. 2d 88, 95 (D. Or. 2015)",
            "Reporter volume is being confirmed with the court library.",
            "2026-11-20 10:25",
          ],
          [
            "CIT ✘",
            "912 F. 4th 33, 41 (9th Cir. 2023)",
            "Quotation taken from a bench ruling transcript, not the opinion.",
            "2026-11-20 10:25",
          ],
          ["QUO ✘", long, REASON, "2026-11-20 10:25"],
        ],
      },
      {
        kind: "paragraph",
        number: 6,
        text: "The author has read the filing in full and takes responsibility for its contents.",
      },
      { kind: "signature", line: "/s/ ________________", date: "2026-11-20" },
    ]);
  });

  it("returns equal lists for equal statements", async () => {
    const { statement } = await buildDemoDocumentStatement();
    expect(renderStatement(statement)).toEqual(renderStatement({ ...statement }));
  });
});

describe("renderStatement structure", () => {
  it("has one title, first, and numbers the final paragraph 5 without overrides", () => {
    const blocks = renderStatement(base());
    expect(blocks.filter((b) => b.kind === "title")).toHaveLength(1);
    expect(blocks[0]).toEqual({ kind: "title", text: "AI-Use and Verification Statement" });
    expect(paragraphs(blocks)).toEqual([
      "1. This filing was prepared with the drafting tool Reveal Codes, which records the origin of every character.",
      "2. No generative artificial intelligence was used in preparing this filing.",
      "3. Every legal citation in this filing was checked against the CourtListener database on 2026-03-04. 0 resolved to a single reported decision, 0 could not be found, 0 matched more than one decision, and 0 were not checked.",
      "4. Quotations attributed to a cited decision were compared with the text of that decision. 0 matched, 0 did not, 0 were not checked.",
      "5. The author has read the filing in full and takes responsibility for its contents.",
    ]);
    expect(blocks.at(-1)).toEqual({
      kind: "signature",
      line: "/s/ ________________",
      date: "2026-03-04",
    });
  });

  it("says the date was not recorded when verifiedAt is null", () => {
    const s = base({ verifiedAt: null, verifiedDate: null });
    expect(paragraphs(renderStatement(s))[2]).toBe(
      "3. Every legal citation in this filing was checked against the CourtListener database on a date that was not recorded. 0 resolved to a single reported decision, 0 could not be found, 0 matched more than one decision, and 0 were not checked.",
    );
  });

  it("reads Tools: not recorded when the tool list is empty", () => {
    const s = base({ aiUsed: true, characters: { ...ZERO, AI: 1, HUM: 1 } });
    expect(paragraphs(renderStatement(s))[1]).toBe(
      "2. Generative artificial intelligence was used in preparing this filing. Tools: not recorded. Text inserted by the tool accounts for 1 of 2 characters (50.0%); of that, 0 characters were subsequently edited by the author.",
    );
  });

  it("prints a provider alone when the model is null", () => {
    expect(aiParagraph(1, 0, 2)).toContain("Tools: p. ");
  });

  it("cuts a quotation at 80 characters and keeps 80 whole", () => {
    const q80 = "q".repeat(80);
    const s = base({
      quotes: [
        { text: q80, status: "unchecked" },
        { text: `${q80}x`, status: "unchecked" },
      ],
    });
    const table = renderStatement(s).find((b) => b.kind === "table" && b.columns.length === 2);
    expect(table).toEqual({
      kind: "table",
      columns: ["Quotation", "Status"],
      rows: [
        [q80, "QUO …"],
        [`${"q".repeat(79)}…`, "QUO …"],
      ],
    });
  });

  it("shows ? and … codes for ambiguous and unchecked citations", () => {
    const s = base({
      citations: [
        { text: "a", status: "ambiguous" },
        { text: "b", status: "unchecked" },
      ],
    });
    const table = renderStatement(s).find((b) => b.kind === "table");
    expect(table).toMatchObject({
      rows: [
        ["a", "CIT ?", ""],
        ["b", "CIT …", ""],
      ],
    });
  });
});

describe("percentage", () => {
  const cases: readonly [number, number, number, string][] = [
    [0, 0, 0, "0.0"],
    [1, 0, 3, "33.3"],
    [1, 0, 8, "12.5"],
    [1, 0, 16, "6.3"],
    [2, 0, 3, "66.7"],
  ];
  it.each(cases)("%i AI, %i edited, %i total", (ai, edited, total, want) => {
    const text = aiParagraph(ai, edited, total);
    expect(text).toContain(`characters (${want}%)`);
  });
});
