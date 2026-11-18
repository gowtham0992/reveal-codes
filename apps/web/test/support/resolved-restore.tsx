import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createDocument } from "@reveal-codes/engine";
import type { Document, IssueKey } from "@reveal-codes/engine";
import type { Editor } from "@tiptap/core";
import type { DisplayInfo } from "@reveal-codes/verifier/link";
import { expect } from "vitest";
import { AppShell } from "../../src/components/app-shell";
import { AUTOSAVE_KEY, serialise } from "../../src/persist";
import type { AppServices } from "../../src/services";
import { keysOf, withResults } from "./case-match-region";
import { createManualTimers } from "./clock";
import { createMemoryStorage } from "./memory-storage";
import type { MemoryStorage } from "./memory-storage";
import { modeApi } from "./mode-fetch";
import { ISO } from "./persist-fixtures";
import { act, fireEvent, renderUi, screen, waitFor, within } from "./render";
import { createFakeViewport } from "./viewport";
import { fakeBrowserServices } from "./browser-services";
// Shared helpers for resolved-restore.test.tsx (citation-check-page Requirement 25).
export const CITED = "Roe v. Wade, 410 U.S. 113 (1973). Ashcroft v. Iqbal, 556 U.S. 662 (2009).";
export const ROE: DisplayInfo = { clusterId: "108713", foundName: "Roe v. Wade", foundYear: 1973 };
export const IQBAL: DisplayInfo = {
  clusterId: "145875",
  foundName: "Ashcroft v. Iqbal",
  foundYear: 2009,
};
export const HEADING = "Resolved citations";
export const UNREADABLE = "The saved document could not be read.";

export function citedDocument(): Document {
  return withResults(CITED, [
    { status: "verified", clusterId: "108713" },
    { status: "verified", clusterId: "145875" },
  ]);
}
export function infoFor(doc: Document): ReadonlyMap<IssueKey, DisplayInfo> {
  const [a, b] = keysOf(doc);
  if (a === undefined || b === undefined) throw new Error("fixture lacks two citations");
  return new Map([
    [a, ROE],
    [b, IQBAL],
  ]);
}
export function stored(storage: MemoryStorage): string {
  const raw = storage.getItem(AUTOSAVE_KEY);
  if (raw === null) throw new Error("nothing stored");
  return raw;
}
export function storedResolved(storage: MemoryStorage): unknown {
  return (JSON.parse(stored(storage)) as Record<string, unknown>)["resolved"];
}

export function shellServices(storage: MemoryStorage) {
  const timers = createManualTimers();
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
  return { services, timers, mode };
}
export async function mountShell(storage: MemoryStorage) {
  const made = shellServices(storage);
  const view = renderUi(<AppShell services={made.services} />);
  await act(async () => {
    await Promise.resolve();
  });
  return { ...made, view };
}
export async function wait300(m: { timers: ReturnType<typeof createManualTimers> }): Promise<void> {
  await act(async () => {
    m.timers.advance(300);
    await Promise.resolve();
  });
}
export const section = (): HTMLElement | null => screen.queryByRole("region", { name: HEADING });
/** Text and address of every Resolved_List row. */
export function listed(): { text: string[]; hrefs: (string | null)[] } {
  const s = section();
  if (s === null) return { text: [], hrefs: [] };
  const rows = within(s).getAllByRole("listitem");
  return {
    text: rows.map((r) => r.textContent),
    hrefs: within(s)
      .getAllByRole("link")
      .map((a) => a.getAttribute("href")),
  };
}
export function seeded(): MemoryStorage {
  const storage = createMemoryStorage();
  const doc = demoDocument();
  storage.setItem(AUTOSAVE_KEY, serialise(doc, [], null, null));
  return storage;
}
export function demoMotionText(): string {
  return readFileSync(
    resolve(
      dirname(fileURLToPath(import.meta.url)),
      "../../../../packages/engine/fixtures/demo-motion.txt",
    ),
    "utf8",
  );
}
export function demoDocument(): Document {
  const made = createDocument(demoMotionText(), ISO);
  if (!made.ok) throw new Error("demo rejected");
  return made.value;
}
export async function verify(): Promise<void> {
  await act(async () => {
    fireEvent.click(within(screen.getByRole("toolbar")).getByRole("button", { name: "Verify" }));
    await Promise.resolve();
  });
  await waitFor(() => {
    expect(section()).not.toBeNull();
  });
}

/** The editor's TipTap instance, from the Document textbox. */
export function editorOf(): Editor {
  const el: HTMLElement & { editor?: Editor } = screen.getByRole("textbox", { name: "Document" });
  if (el.editor === undefined) throw new Error("no editor on the textbox");
  return el.editor;
}
