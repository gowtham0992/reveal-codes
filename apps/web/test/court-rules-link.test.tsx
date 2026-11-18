// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { useMemo, useSyncExternalStore } from "react";
import { ORDERS } from "@reveal-codes/export";
import { createAutosave } from "../src/autosave";
import { createDraftGate } from "../src/draft-gate";
import { SmallScreenPage } from "../src/components/small-screen-page";
import { Toolbar } from "../src/components/toolbar";
import { useExport } from "../src/components/use-export";
import { createOrderSelectionStore } from "../src/order-selection";
import type { AppServices } from "../src/services";
import { createManualTimers } from "./support/clock";
import { EXPORT_NOW, storeWith } from "./support/export-fixtures";
import { createMemoryStorage } from "./support/memory-storage";
import { modeApi } from "./support/mode-fetch";
import { humanDocument } from "./support/order-fixtures";
import { act, fireEvent, renderUi, screen } from "./support/render";
import { createFakeViewport } from "./support/viewport";
import { fakeBrowserServices } from "./support/browser-services";

function useHarnessServices() {
  const storage = useMemo(() => createMemoryStorage(), []);
  const timers = useMemo(() => createManualTimers(), []);
  const svc: AppServices = {
    api: modeApi("fixtures").api,
    now: () => EXPORT_NOW,
    setTimer: (fn, ms) => timers.setTimeout(fn, ms),
    clearTimer: (h) => {
      timers.clearTimeout(h as number);
    },
    storage,
    download: () => undefined,
    openPrint: () => true,
    viewport: createFakeViewport(),
    ...fakeBrowserServices(),
  };
  return { storage, svc };
}

function ExportHarness() {
  const { storage, svc } = useHarnessServices();
  const store = useMemo(() => storeWith(humanDocument(), null), []);
  const autosave = useMemo(
    () =>
      createAutosave({
        storage,
        setTimer: svc.setTimer,
        clearTimer: svc.clearTimer,
        onError: () => undefined,
      }),
    [],
  );
  const orderStore = useMemo(() => createOrderSelectionStore(storage, ORDERS), [storage]);
  const doc = useSyncExternalStore(
    store.subscribe,
    () => store.getState().document,
    () => store.getState().document,
  );
  const gate = createDraftGate();
  const x = useExport({
    svc,
    store,
    autosave,
    gate,
    doc,
    notice: null,
    orderStore,
    onGo: () => undefined,
  });
  return (
    <>
      <Toolbar
        notice={null}
        empty={true}
        step="none"
        paneOpen={false}
        verifyDisabled={false}
        {...x.toolbar}
      />
      {x.dialog}
    </>
  );
}

describe("Court_Rules_Link in the Export dialog _Requirements: 9.1, 16.8_", () => {
  it("opens in a new tab with rel noreferrer, beside the Picker", () => {
    renderUi(<ExportHarness />);
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: /^Export/ }));
    });
    const dialog = screen.getByRole("dialog", { name: "Export" });
    const link = [...dialog.querySelectorAll("a")].find(
      (a) => a.textContent === "See all court rules",
    );
    expect(link?.getAttribute("href")).toBe("/courts");
    expect(link?.getAttribute("target")).toBe("_blank");
    expect(link?.getAttribute("rel")).toBe("noreferrer");
    const picker = screen.getByRole("combobox", { name: "Court or judge" });
    expect(link?.parentElement?.contains(picker)).toBe(true);
    expect(link?.parentElement?.children.length).toBe(2);
    expect(picker.compareDocumentPosition(link as Node) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });
});

describe("Court_Rules_Link on the Small_Screen_Page _Requirements: 9.2, 9.3, 16.8_", () => {
  it("is present, same tab, with both public addresses unset", () => {
    const { container } = renderUi(<SmallScreenPage links={{ video: null, repo: null }} />);
    const anchors = [...container.querySelectorAll("a")];
    expect(anchors.map((a) => a.textContent)).toEqual([
      "Check the citations in a draft",
      "See all court rules",
    ]);
    expect(anchors[1]?.getAttribute("href")).toBe("/courts");
    expect(anchors[1]?.hasAttribute("target")).toBe(false);
  });
  it("comes after the Check link and before the video and repository links", () => {
    const { container } = renderUi(
      <SmallScreenPage links={{ video: "https://example.org/v", repo: "https://example.org/r" }} />,
    );
    const anchors = [...container.querySelectorAll("a")];
    expect(anchors.map((a) => a.getAttribute("href"))).toEqual([
      "/check",
      "/courts",
      "https://example.org/v",
      "https://example.org/r",
    ]);
    expect(anchors[1]?.hasAttribute("target")).toBe(false);
  });
});

describe("Court_Rules_Link in the Toolbar _Requirements: 9.4, 9.5, 16.8_", () => {
  it("is the last child, after the notice, a plain link without data-primary", () => {
    renderUi(
      <Toolbar notice={null} empty={true} step="verify" paneOpen={false} verifyDisabled={false} />,
    );
    const toolbar = screen.getByRole("toolbar");
    const last = toolbar.lastElementChild;
    expect(last?.tagName).toBe("A");
    expect(last?.textContent).toBe("Court rules");
    expect(last?.getAttribute("href")).toBe("/courts");
    expect(last?.getAttribute("target")).toBe("_blank");
    expect(last?.getAttribute("rel")).toBe("noreferrer");
    expect(last?.hasAttribute("data-primary")).toBe(false);
    expect(last?.previousElementSibling?.getAttribute("role")).toBe("status");
    expect(toolbar.querySelectorAll("[data-primary='true']")).toHaveLength(1);
  });
});
