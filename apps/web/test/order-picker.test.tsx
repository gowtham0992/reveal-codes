// @vitest-environment jsdom
import { ORDERS, selectableOrders } from "@reveal-codes/export";
import type { OrderEntry } from "@reveal-codes/export";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { OrderPicker, OrderSummary } from "../src/components/order-picker";
import { useOrderGate } from "../src/components/use-order-gate";
import { NO_ORDER_LABEL, optionText, quoted, summaryLine } from "../src/order-copy";
import { ORDER_KEY, createOrderSelectionStore } from "../src/order-selection";
import type { OrderSelection } from "../src/order-selection";
import { createMemoryStorage } from "./support/memory-storage";
import { entryOf, humanDocument } from "./support/order-fixtures";
import { fireEvent, renderUi, screen, within } from "./support/render";

const PICKER_NAME = "Court or judge";

function Connected({ store }: { store: ReturnType<typeof createOrderSelectionStore> }) {
  const gate = useOrderGate(humanDocument(), store);
  return (
    <>
      <OrderPicker selection={gate.selection} onSelect={gate.select} />
      <OrderSummary entry={gate.entry} />
    </>
  );
}

function mount(storage = createMemoryStorage()) {
  const store = createOrderSelectionStore(storage, ORDERS);
  renderUi(<Connected store={store} />);
  return { storage, store };
}

const picker = (): HTMLSelectElement =>
  screen.getByRole<HTMLSelectElement>("combobox", { name: PICKER_NAME });

function choose(id: string): void {
  fireEvent.change(picker(), { target: { value: id } });
}

describe("OrderPicker option cut _Requirements: 9.7_", () => {
  const base = selectableOrders(ORDERS)
    .flatMap((g) => g.entries)
    .find((e) => e.judge === null) as OrderEntry;
  it("keeps 80 code points and cuts 81 with an ellipsis, for plain text", () => {
    const eighty = "E".repeat(80);
    expect(optionText({ ...base, judge: null, instrument: eighty })).toContain(` ${eighty} (`);
    const cut = optionText({ ...base, judge: null, instrument: `${eighty}x` });
    expect(cut).toContain(`${"E".repeat(79)}\u2026 (`);
  });
});
describe("OrderPicker structure _Requirements: 3.1, 3.3, 3.4, 3.5_", () => {
  it("is a native select labelled Court or judge, above nothing but its label", () => {
    mount();
    const select = picker();
    expect(select.tagName).toBe("SELECT");
    expect(screen.getByLabelText(PICKER_NAME)).toBe(select);
  });

  it("lists the no-order option first, with the empty value", () => {
    mount();
    const first = picker().options[0];
    expect(first?.textContent).toBe(NO_ORDER_LABEL);
    expect(first?.value).toBe("");
  });

  it("has one optgroup per selectableOrders group, with the same options in order", () => {
    mount();
    const groups = Array.from(picker().querySelectorAll("optgroup"));
    const expected = selectableOrders(ORDERS);
    expect(groups.map((g) => g.label)).toEqual(expected.map((g) => g.court));
    groups.forEach((group, i) => {
      const entries = expected[i]?.entries ?? [];
      expect(
        Array.from(group.querySelectorAll("option")).map((o) => [o.value, o.textContent]),
      ).toEqual(entries.map((e) => [e.id, optionText(e)]));
    });
  });

  it("offers no option for an entry that is not current", () => {
    mount();
    const values = Array.from(picker().options).map((o) => o.value);
    const notCurrent = ORDERS.entries.filter((e) => e.status !== "current");
    expect(notCurrent.length).toBeGreaterThan(0);
    for (const entry of notCurrent) expect(values).not.toContain(entry.id);
    const current = ORDERS.entries.filter((e) => e.status === "current");
    expect(values.filter((v) => v !== "")).toHaveLength(current.length);
  });
});

describe("OrderPicker selection _Requirements: 3.6, 3.7_", () => {
  it("writes the choice to the Selection_Store and clears it again", () => {
    const { storage, store } = mount();
    choose("sdohio-newman");
    expect(store.get()).toEqual({ entryId: "sdohio-newman" });
    expect(JSON.parse(storage.data.get(ORDER_KEY) ?? "null")).toEqual({
      version: 1,
      entryId: "sdohio-newman",
    });
    choose("");
    expect(store.get()).toBeNull();
    expect(storage.data.has(ORDER_KEY)).toBe(false);
  });

  it("opens on the stored entry", () => {
    const storage = createMemoryStorage();
    storage.setItem(ORDER_KEY, JSON.stringify({ version: 1, entryId: "edtex-love-2025" }));
    mount(storage);
    expect(picker().value).toBe("edtex-love-2025");
  });

  it("opens on the no-order option for an unknown id and for a superseded id", () => {
    for (const entryId of ["no-such-entry", "ndtex-starr-2023"]) {
      const storage = createMemoryStorage();
      storage.setItem(ORDER_KEY, JSON.stringify({ version: 1, entryId }));
      const { unmount } = renderUi(
        <Connected store={createOrderSelectionStore(storage, ORDERS)} />,
      );
      expect(picker().value).toBe("");
      expect(screen.queryByRole("link", { name: "Source" })).toBeNull();
      unmount();
    }
  });
});

describe("OrderSummary _Requirements: 3.8, 3.11_", () => {
  it("shows the summary line, the quoted key language and the Source link", () => {
    mount();
    choose("sdohio-newman");
    const entry = entryOf("sdohio-newman");
    expect(screen.getByText(summaryLine(entry))).toBeTruthy();
    expect(summaryLine(entry)).toBe(
      "AI drafting prohibited \u00B7 attorneys and self-represented parties \u00B7 2025-08-27",
    );
    expect(screen.getByText(quoted(entry.key_language))).toBeTruthy();
    const link = screen.getByRole("link", { name: "Source" });
    expect(link.getAttribute("href")).toBe(entry.source_url);
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noreferrer");
  });

  it("shows no summary without a selection, and drops it when the selection is cleared", () => {
    mount();
    expect(screen.queryByRole("link", { name: "Source" })).toBeNull();
    choose("edtex-love-2025");
    expect(screen.getByRole("link", { name: "Source" })).toBeTruthy();
    choose("");
    expect(screen.queryByRole("link", { name: "Source" })).toBeNull();
    expect(within(document.body).queryByText(/\u00B7/)).toBeNull();
  });
});

describe("OrderPicker as a controlled component", () => {
  it("reports the chosen id", () => {
    const seen: OrderSelection[] = [];
    renderUi(
      <OrderPicker
        selection={null}
        onSelect={(s) => {
          seen.push(s);
        }}
      />,
    );
    choose("dhaw-go-23-1");
    expect(seen).toEqual([{ entryId: "dhaw-go-23-1" }]);
  });
});

describe("OrderPicker width _Requirements: 3.2_", () => {
  it("styles the select at the full width of the dialog", () => {
    mount();
    const css = readFileSync(
      join(process.cwd(), "apps/web/src/components/order-picker.module.css"),
      "utf8",
    );
    const rule = /\.select\s*\{([^}]*)\}/.exec(css)?.[1] ?? "";
    expect(rule).toMatch(/width:\s*100%/);
    expect(picker().className).toContain("select");
  });
});
