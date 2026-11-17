// @vitest-environment jsdom
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CheckPage } from "../src/check/check-page";
import { STORAGE_STATEMENT, STORAGE_STATEMENT_WIDE } from "../src/check/check-text";
import type { AppServices } from "../src/services";
import { createFakeClipboard } from "./support/browser-services";
import { createManualTimers } from "./support/clock";
import { createMemoryStorage } from "./support/memory-storage";
import { modeApi } from "./support/mode-fetch";
import { act, renderUi } from "./support/render";
import { createFakeViewport } from "./support/viewport";

function services(width: number): AppServices {
  const timers = createManualTimers();
  return {
    api: modeApi("fixtures").api,
    now: timers.clock.now,
    setTimer: (fn, ms) => timers.setTimeout(fn, ms),
    clearTimer: (h) => {
      timers.clearTimeout(h as number);
    },
    storage: createMemoryStorage(),
    download: () => undefined,
    openPrint: () => true,
    viewport: createFakeViewport(width),
    session: createMemoryStorage(),
    clipboard: createFakeClipboard(),
  };
}

async function mountAt(width: number): Promise<HTMLElement> {
  let container: HTMLElement | null = null;
  await act(async () => {
    container = renderUi(<CheckPage services={services(width)} styles={{}} />).container;
    await Promise.resolve();
  });
  if (container === null) throw new Error("not mounted");
  return container;
}

const storageParagraphs = (root: ParentNode): string[] =>
  [...root.querySelectorAll("p")]
    .map((p) => p.textContent)
    .filter((t) => /\bstor(ed|es|e|ing)\b/iu.test(t));

describe("Storage_Statement _Requirements: 22.4, 22.5, 22.9_", () => {
  it("is the narrow statement at 375px, with no mention of the editor", async () => {
    const root = await mountAt(375);
    expect(storageParagraphs(root)).toEqual([STORAGE_STATEMENT]);
    expect(root.textContent).not.toContain("in the editor");
  });

  it("adds the editor clause at 1280px, in the same one paragraph", async () => {
    const root = await mountAt(1280);
    expect(storageParagraphs(root)).toEqual([STORAGE_STATEMENT_WIDE]);
  });

  it("renders the narrow statement and no editor mention in the server HTML", () => {
    const html = renderToString(<CheckPage services={services(1280)} styles={{}} />);
    expect(html).toContain(STORAGE_STATEMENT);
    expect(html).not.toContain(STORAGE_STATEMENT_WIDE);
    expect(html).not.toContain("in the editor");
    expect(html.match(/stored/gu)).toHaveLength(1);
  });
});
