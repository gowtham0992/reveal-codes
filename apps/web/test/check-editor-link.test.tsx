// @vitest-environment jsdom
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { HANDOVER_KEY } from "../src/handover";
import { CheckPage } from "../src/check/check-page";
import {
  HANDOVER_FAILED,
  STORAGE_STATEMENT,
  STORAGE_STATEMENT_WIDE,
} from "../src/check/check-text";
import { defaultServices } from "../src/services";
import type { AppServices } from "../src/services";
import { createFakeClipboard } from "./support/browser-services";
import { createManualTimers } from "./support/clock";
import { createMemoryStorage } from "./support/memory-storage";
import type { MemoryStorage } from "./support/memory-storage";
import { modeApi } from "./support/mode-fetch";
import { act, fireEvent, renderUi, screen } from "./support/render";
import { createFakeViewport } from "./support/viewport";
import type { FakeViewport } from "./support/viewport";

const LINK_TEXT = "Open this draft in the editor";
const FAILED_SENTENCE =
  "The draft could not be passed to the editor. Copy it and paste it into the editor.";
const DRAFT = "See Roe v. Wade, 410 U.S. 113 (1973). Secret marker sentence.";

type Fixture = Readonly<{ svc: AppServices; viewport: FakeViewport; session: MemoryStorage }>;

function fixture(width: number, options: { throwOnSet?: boolean } = {}): Fixture {
  const timers = createManualTimers();
  const viewport = createFakeViewport(width);
  const session = createMemoryStorage(options);
  const svc: AppServices = {
    api: modeApi("fixtures").api,
    now: timers.clock.now,
    setTimer: (fn, ms) => timers.setTimeout(fn, ms),
    clearTimer: (h) => {
      timers.clearTimeout(h as number);
    },
    storage: createMemoryStorage(),
    download: () => undefined,
    openPrint: () => true,
    viewport,
    session,
    clipboard: createFakeClipboard(),
  };
  return { svc, viewport, session };
}

async function mount(f: Fixture): Promise<void> {
  await act(async () => {
    renderUi(<CheckPage services={f.svc} styles={{}} />);
    await Promise.resolve();
  });
}

function type(text: string): void {
  act(() => {
    fireEvent.change(screen.getByLabelText("Your draft"), { target: { value: text } });
  });
}

const link = (): HTMLElement | null => screen.queryByRole("link", { name: LINK_TEXT });

async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 50));
  });
}

const FOOTER_TEXT = "Open the editor";
const RULES_TEXT = "See all court rules";

/** Names of every link to the editor, apart from the brand link. */
const editorLinks = (): string[] =>
  screen.queryAllByRole("link", { name: /editor/i }).map((a) => a.textContent);
const rulesLink = (): HTMLElement | null => screen.queryByRole("link", { name: RULES_TEXT });

describe("one link to the editor _Requirements: 28.1, 28.2, 28.3, 28.4, 28.5, 28.6, 28.7_", () => {
  it("shows only the footer link at 375px with text", async () => {
    const f = fixture(375);
    await mount(f);
    type(DRAFT);
    expect(editorLinks()).toEqual([FOOTER_TEXT]);
    expect(rulesLink()).not.toBeNull();
  });

  it("shows only the Editor_Link at 1280px with text", async () => {
    const f = fixture(1280);
    await mount(f);
    type(DRAFT);
    expect(editorLinks()).toEqual([LINK_TEXT]);
    expect(rulesLink()).not.toBeNull();
  });

  it("shows only the footer link at 1280px with an empty box", async () => {
    const f = fixture(1280);
    await mount(f);
    expect(editorLinks()).toEqual([FOOTER_TEXT]);
    expect(rulesLink()).not.toBeNull();
  });

  it("shows only the footer link at 1280px with out-of-date results", async () => {
    const f = fixture(1280);
    await mount(f);
    type(DRAFT);
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Check citations" }));
    });
    await settle();
    expect(editorLinks()).toEqual([LINK_TEXT]);
    type(`${DRAFT} More.`);
    expect(screen.queryByText("Earlier results")).not.toBeNull();
    expect(editorLinks()).toEqual([FOOTER_TEXT]);
    expect(rulesLink()).not.toBeNull();
  });

  it("swaps on a live width change and on emptying and filling the box", async () => {
    const f = fixture(375);
    await mount(f);
    type(DRAFT);
    expect(editorLinks()).toEqual([FOOTER_TEXT]);
    act(() => {
      f.viewport.setWidth(1280);
    });
    expect(editorLinks()).toEqual([LINK_TEXT]);
    type("");
    expect(editorLinks()).toEqual([FOOTER_TEXT]);
    type(DRAFT);
    expect(editorLinks()).toEqual([LINK_TEXT]);
    act(() => {
      f.viewport.setWidth(375);
    });
    expect(editorLinks()).toEqual([FOOTER_TEXT]);
    expect(rulesLink()).not.toBeNull();
  });

  it("holds the footer link and no Editor_Link in the server HTML", () => {
    const html = renderToString(<CheckPage services={fixture(1280).svc} styles={{}} />);
    expect(html).toContain(">Open the editor</a>");
    expect(html).not.toContain(LINK_TEXT);
    expect(html).toContain(RULES_TEXT);
  });
});

describe("Editor_Link _Requirements: 12.1, 12.2, 12.3, 12.8, 17.4_", () => {
  it("is absent from the server HTML, which still holds the box and the actions", () => {
    const f = fixture(1280);
    const html = renderToString(<CheckPage services={f.svc} styles={{}} />);
    expect(html).not.toContain(LINK_TEXT);
    expect(html).toContain("Your draft");
    expect(html).toContain("Check citations");
  });

  it("is absent below 800px even with text in the box", async () => {
    const f = fixture(799);
    await mount(f);
    type(DRAFT);
    expect(link()).toBeNull();
  });

  it("is absent while the box is empty and present at 800px with text", async () => {
    const f = fixture(800);
    await mount(f);
    expect(link()).toBeNull();
    type(DRAFT);
    expect(link()).not.toBeNull();
  });

  it("disappears when the viewport narrows after render", async () => {
    const f = fixture(1280);
    await mount(f);
    type(DRAFT);
    expect(link()).not.toBeNull();
    act(() => {
      f.viewport.setWidth(500);
    });
    expect(link()).toBeNull();
  });

  it("shows the link and the extra clause after widening, and drops both on narrowing", async () => {
    const f = fixture(375);
    await mount(f);
    type(DRAFT);
    expect(link()).toBeNull();
    expect(screen.queryByText(STORAGE_STATEMENT)).not.toBeNull();
    act(() => {
      f.viewport.setWidth(1280);
    });
    expect(link()).not.toBeNull();
    expect(screen.queryByText(STORAGE_STATEMENT_WIDE)).not.toBeNull();
    expect(screen.queryByText(STORAGE_STATEMENT)).toBeNull();
    act(() => {
      f.viewport.setWidth(375);
    });
    expect(link()).toBeNull();
    expect(screen.queryByText(STORAGE_STATEMENT_WIDE)).toBeNull();
    expect(screen.queryByText(STORAGE_STATEMENT)).not.toBeNull();
  });

  it("does the same through the real resize event of defaultServices().viewport", async () => {
    const original = window.innerWidth;
    const setInner = (w: number): void => {
      Object.defineProperty(window, "innerWidth", { configurable: true, writable: true, value: w });
    };
    setInner(375);
    try {
      const svc: AppServices = { ...fixture(375).svc, viewport: defaultServices().viewport };
      await act(async () => {
        renderUi(<CheckPage services={svc} styles={{}} />);
        await Promise.resolve();
      });
      type(DRAFT);
      expect(link()).toBeNull();
      expect(screen.queryByText(STORAGE_STATEMENT)).not.toBeNull();
      act(() => {
        setInner(1280);
        window.dispatchEvent(new Event("resize"));
      });
      expect(link()).not.toBeNull();
      expect(screen.queryByText(STORAGE_STATEMENT_WIDE)).not.toBeNull();
      act(() => {
        setInner(375);
        window.dispatchEvent(new Event("resize"));
      });
      expect(link()).toBeNull();
      expect(screen.queryByText(STORAGE_STATEMENT)).not.toBeNull();
    } finally {
      setInner(original);
    }
  });

  it("is absent while the results are out of date", async () => {
    const f = fixture(1280);
    await mount(f);
    type(DRAFT);
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Check citations" }));
    });
    await settle();
    expect(screen.queryByText("Earlier results")).toBeNull();
    expect(link()).not.toBeNull();
    type(`${DRAFT} More.`);
    expect(screen.queryByText("Earlier results")).not.toBeNull();
    expect(link()).toBeNull();
  });

  it("keeps the draft out of the address and passes it through session storage", async () => {
    const f = fixture(1280);
    await mount(f);
    type(DRAFT);
    const anchor = link();
    expect(anchor?.getAttribute("href")).toBe("/");
    // Record whether the page cancelled the click, then stop jsdom from navigating.
    let cancelled = true;
    const record = (e: Event): void => {
      cancelled = e.defaultPrevented;
      e.preventDefault();
    };
    document.addEventListener("click", record);
    act(() => {
      if (anchor !== null) fireEvent.click(anchor);
    });
    document.removeEventListener("click", record);
    expect(cancelled).toBe(false);
    expect(f.session.data.get(HANDOVER_KEY)).toBe(DRAFT);
    expect(anchor?.getAttribute("href")).toBe("/");
  });

  it("cancels the click and shows the approved sentence when the write fails", async () => {
    const f = fixture(1280, { throwOnSet: true });
    await mount(f);
    type(DRAFT);
    expect(screen.queryByText(FAILED_SENTENCE)).toBeNull();
    const anchor = link();
    let proceeded = true;
    act(() => {
      if (anchor !== null) proceeded = fireEvent.click(anchor);
    });
    expect(proceeded).toBe(false);
    expect(f.session.data.has(HANDOVER_KEY)).toBe(false);
    expect(screen.getByText(FAILED_SENTENCE)).not.toBeNull();
    expect(HANDOVER_FAILED).toBe(FAILED_SENTENCE);
  });
});
