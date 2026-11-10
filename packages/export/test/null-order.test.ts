import { describe, expect, it } from "vitest";
import { renderStatement } from "../src/index.js";
import type { StatementBlock } from "../src/index.js";
import { buildDemoDocumentStatement } from "./support/demo-statement.js";

// _Requirements: 4.4, 9.9_

const REASON = "Authority is cited for background only and will be removed.";
const LONG =
  "a pro se plaintiff who alleges retaliation is entitled to discovery before a motion to dismiss may be granted.";

/** The expected blocks of render-statement.test.ts for the Demo_Document, written out again. */
const EXPECTED: readonly StatementBlock[] = [
  { kind: "title", text: "AI-Use and Verification Statement" },
  {
    kind: "paragraph",
    number: 1,
    text: "This filing was prepared with the drafting tool Reveal Codes, which records the origin of every character.",
  },
  {
    kind: "paragraph",
    number: 2,
    text: "Generative artificial intelligence was used in preparing this filing. Tools: fixture: fixture-model. Text inserted by the tool accounts for 48 of 2611 characters (1.8%); of that, 0 characters were subsequently edited by the author.",
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
      [`${LONG.slice(0, 79)}…`, "QUO ✘"],
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
      ["QUO ✘", LONG, REASON, "2026-11-20 10:25"],
    ],
  },
  {
    kind: "paragraph",
    number: 6,
    text: "The author has read the filing in full and takes responsibility for its contents.",
  },
  { kind: "signature", line: "/s/ ________________", date: "2026-11-20" },
];

describe("renderStatement with no order _Requirements: 4.4, 9.9_", () => {
  it("renders the existing expected blocks with the default argument", async () => {
    const { statement, blocks } = await buildDemoDocumentStatement();
    expect(statement.order).toBeNull();
    expect(blocks).toEqual(EXPECTED);
  });

  it("renders the same blocks when null is passed explicitly", async () => {
    const { statement, blocks } = await buildDemoDocumentStatement(null);
    expect(statement.order).toBeNull();
    expect(blocks).toEqual(EXPECTED);
    expect(renderStatement(statement)).toEqual(EXPECTED);
  });

  it("gives equal Statements for the default argument and null", async () => {
    const byDefault = await buildDemoDocumentStatement();
    const explicit = await buildDemoDocumentStatement(null);
    expect(explicit.statement).toEqual(byDefault.statement);
  });
});
