// @vitest-environment jsdom
import { apply, createDocument, declareAi, declareNone } from "@reveal-codes/engine";
import type { Declaration, Document } from "@reveal-codes/engine";
import {
  ORDERS,
  choiceAiLabel,
  choiceNoneLabel,
  requiredLine,
  TOOL_NAME_LINE,
} from "@reveal-codes/export";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ExportDialog } from "../src/components/export-dialog";
import { CONFIDENTIALITY_LABEL } from "../src/order-copy";
import { ORDER_KEY, createOrderSelectionStore } from "../src/order-selection";
import { createStore } from "../src/store-runtime";
import { EXPORT_NOW } from "./support/export-fixtures";
import { createMemoryStorage } from "./support/memory-storage";
import { ISO } from "./support/persist-fixtures";
import { act, fireEvent, renderUi, screen } from "./support/render";

const CHOE = "cit-choe-groves-2025";
const SUBJECT = "pasted_text";
const NONE_LABEL = choiceNoneLabel(SUBJECT);
const AI_LABEL = choiceAiLabel(SUBJECT);

function must<T>(r: { ok: true; value: T } | { ok: false; error: { kind: string } }): T {
  if (!r.ok) throw new Error(`fixture rejected: ${r.error.kind}`);
  return r.value;
}

/** Typed text followed by substantive pasted text: the Declaration_Subject is pasted_text. */
function pastedDocument(): Document {
  let doc = must(createDocument("", ISO));
  const insert = (text: string, origin: "HUM" | "PST"): void => {
    doc = must(
      apply(doc, {
        kind: "insert",
        at: doc.text.length,
        text,
        provenance: { origin, timestamp: ISO },
      }),
    ).document;
  };
  insert("I ask the Court to extend the deadline.\n", "HUM");
  insert("The movant relies on the record.", "PST");
  return doc;
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

function mount(entryId: string | null = null, declaration: Declaration | null = null) {
  const storage = createMemoryStorage();
  if (entryId !== null) storage.setItem(ORDER_KEY, JSON.stringify({ version: 1, entryId }));
  const store = createStore(() => EXPORT_NOW);
  store.dispatch({ type: "replace", document: pastedDocument(), verifiedAt: null, declaration });
  const cleared = vi.fn();
  renderUi(
    <ExportDialog
      document={store.getState().document}
      store={store}
      orderStore={createOrderSelectionStore(storage, ORDERS)}
      now={() => EXPORT_NOW}
      notice={null}
      clearNotice={cleared}
      busy={false}
      onGo={() => undefined}
      onDownload={() => undefined}
      onPrint={() => undefined}
      onClose={() => undefined}
    />,
  );
  return { store, cleared };
}

const button = (name: string): HTMLButtonElement =>
  screen.getByRole<HTMLButtonElement>("button", { name });
const exportsDisabled = (): boolean[] => [
  button("Download .docx").disabled,
  button("Open print view").disabled,
];
const pickAi = (): void => {
  act(() => {
    fireEvent.click(screen.getByLabelText(AI_LABEL));
  });
};
const typeTool = (value: string): void => {
  act(() => {
    fireEvent.change(screen.getByLabelText("Tool name"), { target: { value } });
  });
};

describe("declaration gate in the Export dialog _Requirements: 3.1, 4.1, 4.2, 4.6, 4.8_", () => {
  it("shows no statement, preselects no radio and disables both export buttons", () => {
    mount();
    const radios = screen.getAllByRole<HTMLInputElement>("radio");
    expect(radios.map((r) => r.checked)).toEqual([false, false]);
    expect(screen.getByLabelText(NONE_LABEL)).toBeTruthy();
    expect(screen.getByLabelText(AI_LABEL)).toBeTruthy();
    expect(exportsDisabled()).toEqual([true, true]);
    expect(screen.getByRole("status").textContent).toBe(requiredLine(SUBJECT));
    const text = screen.getByRole("dialog", { name: "Export" }).textContent;
    expect(text).not.toContain("AI-Use and Verification Statement");
    expect(text).not.toContain("The author states that");
  });

  it("enables both buttons once None is chosen, with no tool field", () => {
    mount();
    act(() => {
      fireEvent.click(screen.getByLabelText(NONE_LABEL));
    });
    expect(exportsDisabled()).toEqual([false, false]);
    expect(screen.queryByLabelText("Tool name")).toBeNull();
    expect(screen.getByRole("status").textContent).toBe("");
  });

  it("selects the stored choice when it opens", () => {
    mount(null, declareNone(SUBJECT));
    expect(screen.getByLabelText<HTMLInputElement>(NONE_LABEL).checked).toBe(true);
    expect(exportsDisabled()).toEqual([false, false]);
  });
});

describe("Tool_Name limits _Requirements: 3.2, 3.3, 3.4, 3.5_", () => {
  const long = "a".repeat(100);
  const cases: readonly [string, string, boolean][] = [
    ["empty", "", false],
    ["1 character", "a", false],
    ["2 characters", "ab", true],
    ["100 characters", long, true],
    ["101 characters", `${long}a`, false],
    ["1 character with padding", "  a  ", false],
    ["100 characters with padding", `  ${long}  `, true],
    ["whitespace only", "     ", false],
    ["a control character", "ab\u0007cd", false],
    ["parentheses", "ChatGPT (GPT-4o)", true],
    ["brackets and quotes", 'Tool [v2] "pro"', true],
  ];
  it.each(cases)("%s", (_label, value, valid) => {
    mount();
    pickAi();
    expect(exportsDisabled()).toEqual([true, true]);
    typeTool(value);
    expect(exportsDisabled()).toEqual([!valid, !valid]);
    expect(screen.queryByText(TOOL_NAME_LINE) === null).toBe(valid && value !== "");
  });

  it("rejects a line break in the declaration itself", () => {
    // jsdom strips line breaks from a text input's value, so the rule is checked on declareAi.
    expect(declareAi(SUBJECT, "ab\ncd").ok).toBe(false);
    expect(declareAi(SUBJECT, "ab\r\ncd").ok).toBe(false);
  });

  it("shows the instruction line with an empty name and discards the name on None", () => {
    mount();
    pickAi();
    expect(screen.getByText(TOOL_NAME_LINE)).toBeTruthy();
    typeTool("Claude");
    act(() => {
      fireEvent.click(screen.getByLabelText(NONE_LABEL));
    });
    pickAi();
    expect(screen.getByLabelText<HTMLInputElement>("Tool name").value).toBe("");
    expect(exportsDisabled()).toEqual([true, true]);
  });
});

describe("Confidentiality_Checkbox and clearing _Requirements: 4.9, 4.10, 4.11_", () => {
  const box = (): HTMLInputElement =>
    screen.getByRole<HTMLInputElement>("checkbox", { name: CONFIDENTIALITY_LABEL });

  it("appears only when Used_AI holds, unticked", () => {
    mount(CHOE);
    expect(screen.queryByRole("checkbox")).toBeNull();
    act(() => {
      fireEvent.click(screen.getByLabelText(NONE_LABEL));
    });
    expect(screen.queryByRole("checkbox")).toBeNull();
    pickAi();
    expect(screen.queryByRole("checkbox")).toBeNull();
    typeTool("ChatGPT");
    expect(box().checked).toBe(false);
    expect(exportsDisabled()).toEqual([true, true]);
    act(() => {
      fireEvent.click(screen.getByLabelText(NONE_LABEL));
    });
    expect(screen.queryByRole("checkbox")).toBeNull();
  });

  it("clears the tick and the notice when the Declaration changes", () => {
    const { cleared } = mount(CHOE);
    pickAi();
    typeTool("ChatGPT");
    act(() => {
      fireEvent.click(box());
    });
    expect(box().checked).toBe(true);
    expect(exportsDisabled()).toEqual([false, false]);
    const before = cleared.mock.calls.length;
    typeTool("Claude");
    expect(box().checked).toBe(false);
    expect(exportsDisabled()).toEqual([true, true]);
    expect(cleared.mock.calls.length).toBeGreaterThan(before);
  });
});

describe("the dialog keeps the Declaration on the machine _Requirements: 3.9_", () => {
  it("makes no network request while the author answers", () => {
    const { store } = mount();
    pickAi();
    typeTool("ChatGPT (GPT-4o)");
    expect(store.getState().declaration).toEqual({
      subject: SUBJECT,
      choice: "declared_ai",
      toolName: "ChatGPT (GPT-4o)",
    });
    act(() => {
      fireEvent.click(screen.getByLabelText(NONE_LABEL));
    });
    expect(calls).toEqual([]);
  });
});
