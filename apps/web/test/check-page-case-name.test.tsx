// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { createApiClient } from "../src/client/api";
import type { FetchFn } from "../src/client/api";
import { CheckPage } from "../src/check/check-page";
import { handleMode } from "../src/server/mode-route";
import { readServerConfig } from "../src/server/deps";
import type { AppServices } from "../src/services";
import { createManualTimers } from "./support/clock";
import { createFakeClipboard } from "./support/browser-services";
import { createMemoryStorage } from "./support/memory-storage";
import { act, fireEvent, renderUi, screen, waitFor, within } from "./support/render";
import { routeFetch } from "./support/route-fetch";
import { createFakeViewport } from "./support/viewport";

const SAMPLE = readFileSync(
  resolve(__dirname, "../../../packages/engine/fixtures/avianca-citations.txt"),
  "utf8",
);
const VARGHESE = "Varghese v. China Southern Airlines Co., Ltd.";
const VARGHESE_LINE = `Not found: ${VARGHESE}, 925 F.3d 1339 (11th Cir. 2019).`;

function buildServices(clipboard: ReturnType<typeof createFakeClipboard>): AppServices {
  const routes = routeFetch();
  const fetchFn: FetchFn = (url, init) => {
    if (url === "/api/mode") {
      return Promise.resolve(handleMode(readServerConfig({ REVEAL_CODES_FIXTURES_ONLY: "1" })));
    }
    if (url === "/avianca-citations.txt") return Promise.resolve(new Response(SAMPLE));
    return routes.fetch(url, init);
  };
  const timers = createManualTimers();
  return {
    api: createApiClient(fetchFn),
    now: timers.clock.now,
    setTimer: (fn, ms) => timers.setTimeout(fn, ms),
    clearTimer: (h) => {
      timers.clearTimeout(h as number);
    },
    storage: createMemoryStorage(),
    download: () => undefined,
    openPrint: () => true,
    viewport: createFakeViewport(),
    session: createMemoryStorage(),
    clipboard,
  };
}
async function mountAndCheck() {
  const clipboard = createFakeClipboard();
  const svc = buildServices(clipboard);
  await act(async () => {
    renderUi(<CheckPage services={svc} styles={{}} />);
    await Promise.resolve();
  });
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Load the Avianca citations" }));
    await Promise.resolve();
  });
  await waitFor(() => {
    expect(screen.getByRole<HTMLTextAreaElement>("textbox").value).not.toBe("");
  });
  fireEvent.click(screen.getByRole("button", { name: "Check citations" }));
  await waitFor(() => {
    expect(screen.queryByText("Verifying…")).toBeNull();
  });
  return { clipboard };
}

const items = (): HTMLElement[] => within(screen.getByRole("status")).queryAllByRole("listitem");

describe("check page case names on the Avianca sample _Requirements: 19.6, 19.8, 19.11, 19.12_", () => {
  it("shows Cited as on found and not-found rows, once on wrong-case rows, and copies the Varghese line", async () => {
    const { clipboard } = await mountAndCheck();
    const rows = items();
    expect(rows).toHaveLength(6);

    const varghese = rows.find((li) => li.textContent.includes("925 F.3d 1339"));
    expect(varghese?.textContent.startsWith("CIT ✘")).toBe(true);
    expect(within(varghese as HTMLElement).getByText(`Cited as ${VARGHESE}`)).toBeTruthy();

    for (const li of rows) {
      const code = li.textContent.slice(0, 5);
      const cited = within(li).queryAllByText(/^Cited as /u);
      if (code.startsWith("CIT ✓") || code.startsWith("CIT ✘")) {
        expect(cited.length).toBeLessThanOrEqual(1);
      }
      if (code.startsWith("CIT ≠")) expect(cited).toHaveLength(1);
    }
    const notFound = rows.filter((li) => li.textContent.startsWith("CIT ✘"));
    expect(notFound.every((li) => within(li).queryAllByText(/^Cited as /u).length === 1)).toBe(
      true,
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Copy results" }));
      await Promise.resolve();
    });
    const lines = (clipboard.written[0] ?? "").split("\n");
    expect(lines).toContain(VARGHESE_LINE);
  });
});
