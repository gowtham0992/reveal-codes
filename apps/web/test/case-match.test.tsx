// @vitest-environment jsdom
import type { VerificationResult } from "@reveal-codes/engine";
import { ORDERS } from "@reveal-codes/export";
import type { DisplayInfo } from "@reveal-codes/verifier/link";
import { describe, expect, it } from "vitest";
import { AppShell } from "../src/components/app-shell";
import { ExportDialog } from "../src/components/export-dialog";
import { IssuesRegion } from "../src/components/issues-region";
import { PrintView } from "../src/components/print-view";
import { createOrderSelectionStore } from "../src/order-selection";
import { AUTOSAVE_KEY, serialise } from "../src/persist";
import type { AppServices } from "../src/services";
import { createStore } from "../src/store-runtime";
import { createManualTimers } from "./support/clock";
import { EXPORT_NOW, EXPORT_VERIFIED_AT, pastedAiDeclaration } from "./support/export-fixtures";
import { createMemoryStorage } from "./support/memory-storage";
import { modeApi } from "./support/mode-fetch";
import { act, renderUi, screen, within } from "./support/render";
import { createFakeViewport } from "./support/viewport";
import { fakeBrowserServices } from "./support/browser-services";

import {
  ISO,
  LINK,
  NOW,
  noop,
  TEXT,
  WRONG,
  WRONG_NO_YEAR,
  keysOf,
  overridden,
  region,
  sessionFor,
  withResults,
} from "./support/case-match-region";

describe("Issues row for a wrong case citation _Requirements: 7.1, 7.2, 7.3, 7.4, 7.10_", () => {
  it("shows the chip, the words, the citation, the found line and the buttons", () => {
    region(withResults(TEXT, [WRONG]));
    const row = screen.getByRole("listitem");
    const [lineA, words, text, cited, found] = Array.from(row.children);
    expect(lineA?.firstElementChild?.textContent).toBe("CIT ≠");
    expect(words?.textContent).toBe("blocking, wrong case");
    expect(text?.textContent).toBe("556 U.S. 662, 678 (2009)");
    expect(cited?.textContent).toBe("Cited as Henderson v. Pacific Housing Authority");
    expect(found?.textContent).toBe("This citation is Ashcroft v. Iqbal (2009)");
    expect(within(row).getByRole("button", { name: "Go" })).not.toBeNull();
    expect(within(row).getByRole("button", { name: "Override…" })).not.toBeNull();
    expect(row.textContent).not.toMatch(/[!]/u);
  });

  it("omits the year parentheses when the year is absent", () => {
    region(withResults(TEXT, [WRONG_NO_YEAR]));
    expect(screen.getByText("This citation is Ashcroft v. Iqbal")).not.toBeNull();
  });

  it("reads overridden, wrong case and shows the reason after an Override, with no Override button", () => {
    region(overridden(withResults(TEXT, [WRONG])));
    const row = screen.getByRole("listitem");
    expect(row.textContent).toContain("overridden, wrong case");
    expect(row.textContent).toContain("Overridden: Checked by hand against the reporter.");
    expect(within(row).queryByRole("button", { name: "Override…" })).toBeNull();
  });

  it("builds the link from the cluster id alone, and prefers a usable absoluteUrl", () => {
    region(withResults(TEXT, [WRONG]));
    const link = screen.getByRole("link", { name: LINK });
    expect(link.getAttribute("href")).toBe("https://www.courtlistener.com/opinion/145875/x/");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noreferrer");
  });

  it("uses the absoluteUrl of Display_Info for the same cluster and ignores another cluster's", () => {
    const doc = withResults(TEXT, [WRONG]);
    const key = keysOf(doc)[0];
    if (key === undefined) throw new Error("no citation");
    const same: DisplayInfo = {
      clusterId: "145875",
      foundName: "Ashcroft v. Iqbal",
      absoluteUrl: "/opinion/145875/ashcroft-v-iqbal/",
    };
    const store = createStore(NOW);
    const { unmount } = renderUi(
      <IssuesRegion
        document={doc}
        store={store}
        now={NOW}
        onGo={noop}
        verifiedAt={null}
        note={null}
        verify={{ start: noop, disabled: false }}
        resolved={sessionFor(store, new Map([[key, same]]))}
      />,
    );
    expect(screen.getByRole("link", { name: LINK }).getAttribute("href")).toBe(
      "https://www.courtlistener.com/opinion/145875/ashcroft-v-iqbal/",
    );
    unmount();
    const other: DisplayInfo = { ...same, clusterId: "1", absoluteUrl: "/opinion/1/other/" };
    region(doc, { resolved: sessionFor(store, new Map([[key, other]])) });
    expect(screen.getByRole("link", { name: LINK }).getAttribute("href")).toBe(
      "https://www.courtlistener.com/opinion/145875/x/",
    );
  });
});

describe("Wrong case row after a reload _Requirements: 7.7_", () => {
  it("shows the stored name, year and a link from the stored cluster id with no Verify_Run", async () => {
    const timers = createManualTimers();
    const storage = createMemoryStorage();
    storage.setItem(AUTOSAVE_KEY, serialise(withResults(TEXT, [WRONG]), [], ISO, null));
    const mode = modeApi("fixtures");
    const services: AppServices = {
      api: mode.api,
      now: timers.clock.now,
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
    await act(async () => {
      renderUi(<AppShell services={services} />);
      await Promise.resolve();
    });
    expect(screen.getByText("This citation is Ashcroft v. Iqbal (2009)")).not.toBeNull();
    expect(screen.getByRole("link", { name: LINK }).getAttribute("href")).toBe(
      "https://www.courtlistener.com/opinion/145875/x/",
    );
    expect(mode.routes.requests.filter((r) => r.url === "/api/verify")).toHaveLength(0);
  });
});

describe("Export dialog row for a wrong case citation _Requirements: 7.10_", () => {
  it("shows the chip CIT ≠ and the blocking, wrong case words", () => {
    const doc = withResults(TEXT, [WRONG]);
    renderUi(
      <ExportDialog
        document={doc}
        store={createStore(NOW)}
        orderStore={createOrderSelectionStore(createMemoryStorage(), ORDERS)}
        now={NOW}
        notice={null}
        clearNotice={noop}
        busy={false}
        onGo={noop}
        onDownload={noop}
        onPrint={noop}
        onClose={noop}
      />,
    );
    const list = screen.getByRole("list", { name: "Blocking items" });
    const row = within(list).getByRole("listitem");
    expect(row.textContent).toContain("CIT ≠");
    expect(row.textContent).toContain("blocking, wrong case");
  });
});

describe("Resolved list _Requirements: 7.8, 7.12, 7.13, 7.14, 7.15, 7.16, 7.17_", () => {
  const TWO =
    "Roe v. Wade, 410 U.S. 113 (1973). Henderson v. Pacific Housing Authority, 556 U.S. 662 (2009).";
  const VERIFIED: VerificationResult = { status: "verified", clusterId: "108713" };
  const HEADING = "Resolved citations";

  it("is hidden before a Verify_Run", () => {
    region(withResults(TWO, [VERIFIED, WRONG]));
    expect(screen.queryByText(HEADING)).toBeNull();
  });

  it("lists only verified citations after a run, with found text and link, and no controls", () => {
    const doc = withResults(TWO, [VERIFIED, WRONG]);
    const key = keysOf(doc)[0];
    if (key === undefined) throw new Error("no citation");
    const info: DisplayInfo = { clusterId: "108713", foundName: "Roe v. Wade", foundYear: 1973 };
    const store = createStore(NOW);
    renderUi(
      <IssuesRegion
        document={doc}
        store={store}
        now={NOW}
        onGo={noop}
        verifiedAt={ISO}
        note={null}
        verify={{ start: noop, disabled: false }}
        resolved={sessionFor(store, new Map([[key, info]]))}
      />,
    );
    const section = screen.getByRole("region", { name: HEADING });
    const rows = within(section).getAllByRole("listitem");
    expect(rows).toHaveLength(1);
    expect(rows[0]?.textContent).toContain("410 U.S. 113 (1973)");
    expect(rows[0]?.textContent).toContain("Roe v. Wade (1973)");
    expect(within(section).getByRole("link", { name: LINK }).getAttribute("href")).toBe(
      "https://www.courtlistener.com/opinion/108713/x/",
    );
    expect(within(section).queryAllByRole("button")).toEqual([]);
    expect(section.textContent).not.toContain("Henderson");
    expect(screen.getByRole("heading", { name: "Issues \u2014 1 blocking" })).not.toBeNull();
  });

  it("omits the found text without usable Display_Info but keeps the cluster link", () => {
    const doc = withResults(TWO, [VERIFIED, WRONG]);
    const store = createStore(NOW);
    region(doc, { verifiedAt: ISO, resolved: sessionFor(store, new Map()) });
    const section = screen.getByRole("region", { name: HEADING });
    expect(section.textContent).not.toContain("Roe v. Wade (1973)");
    expect(within(section).getByRole("link", { name: LINK })).not.toBeNull();
  });

  it("is absent after a run when no citation is verified", () => {
    const store = createStore(NOW);
    region(withResults(TEXT, [WRONG]), {
      verifiedAt: ISO,
      resolved: sessionFor(store, new Map()),
    });
    expect(screen.queryByText(HEADING)).toBeNull();
  });

  it("leaves No issues. and the Issues heading unchanged when all citations are verified", () => {
    const doc = withResults(TWO, [VERIFIED, { status: "verified", clusterId: "145875" }]);
    const store = createStore(NOW);
    region(doc, { verifiedAt: ISO, resolved: sessionFor(store, new Map()) });
    expect(screen.getByText("No issues.")).not.toBeNull();
    expect(screen.getByRole("heading", { name: "Issues" })).not.toBeNull();
    expect(screen.getByRole("region", { name: HEADING })).not.toBeNull();
  });
});

describe("Print view with a wrong case citation _Requirements: 8.1, 8.4, 8.7_", () => {
  it("prints the new paragraph, the Status cell and the Override row", () => {
    const doc = overridden(withResults(TEXT, [WRONG]));
    const storage = createMemoryStorage();
    storage.setItem(AUTOSAVE_KEY, serialise(doc, [], EXPORT_VERIFIED_AT, pastedAiDeclaration()));
    const { container } = renderUi(<PrintView services={{ now: () => EXPORT_NOW, storage }} />);
    const statement = container.querySelectorAll("section")[1];
    expect(statement?.textContent).toContain("1 resolved to a different case than the one named, ");
    expect(statement?.textContent).toMatch(
      /0 resolved to a single reported decision, 1 resolved to a different case than the one named, 0 could not be found/u,
    );
    const cells = Array.from(statement?.querySelectorAll("td") ?? []).map((c) => c.textContent);
    expect(cells).toContain("CIT ≠ (Ashcroft v. Iqbal, 2009)");
    expect(cells).toContain("145875");
    expect(cells).toContain("CIT ≠");
    expect(cells).toContain("Checked by hand against the reporter.");
  });
});
