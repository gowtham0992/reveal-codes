// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { apply, createDocument, declareAi } from "@reveal-codes/engine";
import type { Declaration, Document } from "@reveal-codes/engine";
import { buildStatement, firstPageHeading } from "@reveal-codes/export";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { exportDocx } from "../src/client/export-docx";
import { PrintView, declarationPendingText } from "../src/components/print-view";
import { ORDER_KEY } from "../src/order-selection";
import { AUTOSAVE_KEY, serialise } from "../src/persist";
import { parseCss } from "./support/css";
import { readDocxParagraphs } from "./support/docx-text";
import {
  EXPORT_NOW,
  EXPORT_VERIFIED_AT,
  pastedAiDeclaration,
  storeWith,
} from "./support/export-fixtures";
import { createMemoryStorage } from "./support/memory-storage";
import { ISO } from "./support/persist-fixtures";
import { printEntry } from "./support/print-fixtures";
import { renderUi, screen, waitFor } from "./support/render";

const NDTEX = "ndtex-lr-7-2-f";

function pastedDocument(): Document {
  const created = createDocument("", ISO);
  if (!created.ok) throw new Error("fixture rejected");
  const typed = apply(created.value, {
    kind: "insert",
    at: 0,
    text: "I ask the Court to extend the deadline.\n",
    provenance: { origin: "HUM", timestamp: ISO },
  });
  if (!typed.ok) throw new Error("fixture rejected");
  const pasted = apply(typed.value.document, {
    kind: "insert",
    at: typed.value.document.text.length,
    text: "The movant relies on the record.",
    provenance: { origin: "PST", timestamp: ISO },
  });
  if (!pasted.ok) throw new Error("fixture rejected");
  return pasted.value.document;
}

function seeded(declaration: Declaration | null, entryId: string | null) {
  const storage = createMemoryStorage();
  storage.setItem(AUTOSAVE_KEY, serialise(pastedDocument(), [], EXPORT_VERIFIED_AT, declaration));
  if (entryId !== null) storage.setItem(ORDER_KEY, JSON.stringify({ version: 1, entryId }));
  return storage;
}

function print(storage: ReturnType<typeof createMemoryStorage>) {
  return renderUi(<PrintView services={{ storage, now: () => EXPORT_NOW }} />);
}

type Calls = { url: string; body: unknown }[];
let calls: Calls = [];
beforeEach(() => {
  calls = [];
  vi.stubGlobal("fetch", (input: unknown, init?: { body?: unknown }) => {
    calls.push({ url: String(input), body: init?.body ?? null });
    return Promise.resolve(new Response("{}"));
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Print_View while the Declaration is pending _Requirements: 4.3, 4.4, 4.5, 12.4_", () => {
  it("shows one line and a link back to the editor in place of the statement", async () => {
    const { container } = print(seeded(null, null));
    await screen.findByText(declarationPendingText("pasted_text"));
    expect(container.querySelectorAll("p")).toHaveLength(1);
    const link = screen.getByRole("link", { name: "Back to the editor" });
    expect(link.getAttribute("href")).toBe("/");
    expect(container.querySelector("section")).toBeNull();
    expect(container.textContent).not.toContain("AI-Use and Verification Statement");
  });

  it("has no declaration control", async () => {
    print(seeded(null, null));
    await screen.findByText(declarationPendingText("pasted_text"));
    expect(screen.queryByRole("radio")).toBeNull();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("hides the block in print CSS", () => {
    const cssText = readFileSync(
      join(__dirname, "..", "src/components/print-view.module.css"),
      "utf8",
    );
    const hidden = parseCss(cssText).declarations.find(
      (d) =>
        d.selector === ".pending" && d.prop === "display" && d.atRules.includes("@media print"),
    );
    expect(hidden?.value).toBe("none");
  });

  it("marks the block with the pending class", async () => {
    const { container } = print(seeded(null, null));
    await screen.findByText(declarationPendingText("pasted_text"));
    expect(container.firstElementChild?.firstElementChild?.className).toContain("pending");
  });
});

describe("Print_View first-page heading for N.D. Tex. _Requirements: 4.6, 12.4_", () => {
  it("shows the two heading lines with Declared_AI pasted text", async () => {
    const declaration = pastedAiDeclaration();
    const { container } = print(seeded(declaration, NDTEX));
    const built = buildStatement(
      pastedDocument(),
      [],
      { now: EXPORT_NOW, verifiedAt: EXPORT_VERIFIED_AT },
      { entry: printEntry(NDTEX), confidentialityCertified: false },
      declaration,
    );
    if (!built.ok) throw new Error("statement rejected");
    const heading = firstPageHeading(built.value);
    if (heading === null) throw new Error("expected a heading");
    await waitFor(() => {
      expect(container.querySelectorAll("section").length).toBeGreaterThan(0);
    });
    const block = Array.from(container.querySelectorAll("section")).find(
      (s) => s.firstElementChild?.textContent === heading.heading,
    );
    expect(block).toBeDefined();
    expect(block?.className).toContain("firstPage");
    expect(block?.children[1]?.textContent).toBe(heading.pointer);
    expect(screen.queryByRole("radio")).toBeNull();
    expect(container.querySelector("a")?.getAttribute("href")).not.toBe("/");
  });

  it("shows no heading when the author declared that no AI was used", async () => {
    const none: Declaration = { subject: "pasted_text", choice: "none" };
    const { container } = print(seeded(none, NDTEX));
    await waitFor(() => {
      expect(container.querySelectorAll("section").length).toBeGreaterThan(0);
    });
    expect(container.innerHTML).not.toContain("firstPage");
  });
});

describe("no request carries the Declaration _Requirements: 3.9, 12.6, 12.7_", () => {
  it("makes none from the Print view", async () => {
    const { container } = print(seeded(pastedAiDeclaration(), NDTEX));
    await waitFor(() => {
      expect(container.querySelectorAll("section").length).toBeGreaterThan(0);
    });
    expect(calls).toEqual([]);
  });

  it("makes none from exportDocx, which refuses while pending and exports once declared", async () => {
    const downloads: string[] = [];
    const download = (_bytes: Uint8Array, name: string): void => {
      downloads.push(name);
    };
    const pending = storeWith(pastedDocument(), EXPORT_VERIFIED_AT, null);
    const refused = await exportDocx(pending, {
      now: () => EXPORT_NOW,
      download,
      orderContext: null,
    });
    expect(refused).toEqual({ status: "blocked" });
    expect(downloads).toEqual([]);

    const made = declareAi("pasted_text", "ChatGPT (GPT-4o)");
    if (!made.ok) throw new Error("declaration rejected");
    const bytes: Uint8Array[] = [];
    const declared = storeWith(pastedDocument(), EXPORT_VERIFIED_AT, made.value);
    const outcome = await exportDocx(declared, {
      now: () => EXPORT_NOW,
      download: (b) => {
        bytes.push(b);
      },
      orderContext: null,
    });
    expect(outcome.status).toBe("exported");
    const first = bytes[0];
    if (first === undefined) throw new Error("no download");
    const paragraphs = readDocxParagraphs(first);
    expect(paragraphs.some((p) => p.includes("ChatGPT (GPT-4o)"))).toBe(true);
    expect(calls).toEqual([]);
  });
});
