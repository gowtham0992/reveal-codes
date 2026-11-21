// @vitest-environment jsdom
// Task 3.2: Load demo motion installs the recorded draft. _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.8, 4.1, 4.2, 4.3, 5.1, 5.2, 7.1_
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { apply, createDocument } from "@reveal-codes/engine";
import type { Document } from "@reveal-codes/engine";
import { describe, expect, it, vi } from "vitest";
import { createApiClient } from "../src/client/api";
import type { FetchFn } from "../src/client/api";
import { localTime } from "../src/client/verify-summary";
import { AppShell } from "../src/components/app-shell";
import { RECORDED_SAMPLE_LOADED } from "../src/notices";
import { PANE_KEY, encodePreference } from "../src/pane-preference";
import { AUTOSAVE_KEY, deserialise, serialise } from "../src/persist";
import type { AppServices } from "../src/services";
import { readServerConfig } from "../src/server/deps";
import { handleMode } from "../src/server/mode-route";
import { createManualTimers } from "./support/clock";
import type { ManualTimers } from "./support/clock";
import { fakeBrowserServices } from "./support/browser-services";
import { loadDemo } from "./support/document-actions-harness";
import { createMemoryStorage } from "./support/memory-storage";
import type { MemoryStorage } from "./support/memory-storage";
import { act, fireEvent, renderUi, screen, within } from "./support/render";
import { routeFetch } from "./support/route-fetch";
import { createFakeViewport } from "./support/viewport";
vi.mock("../src/components/shell-toolbar", async (original) =>
  (await import("./support/document-actions-harness")).capturingToolbar(
    await original<typeof import("../src/components/shell-toolbar")>(),
  ),
);
const FILE = resolve(__dirname, "../../../packages/engine/fixtures/demo-motion.recorded.json");
const RECORDED = readFileSync(FILE, "utf8");
const FAILED = "Could not load the demo motion.";
const EARLIER = "Earlier typed text.";
const ISO = "2026-11-02T12:00:00.000Z";
const NOW = Date.UTC(2026, 11, 1, 8, 7);
type Setting = "fixtures" | "live";
type Mounted = Readonly<{
  storage: MemoryStorage;
  timers: ManualTimers;
  urls: string[];
  verifyBodies: string[];
}>;
type Options = Readonly<{ setting: Setting; fileMissing?: boolean; seed?: string }>;
function recordingFetch(options: Options, urls: string[], verifyBodies: string[]): FetchFn {
  const routes = routeFetch();
  const env =
    options.setting === "live"
      ? { COURTLISTENER_TOKEN: "test-token-not-real" }
      : { REVEAL_CODES_FIXTURES_ONLY: "1" };
  return async (input, init) => {
    urls.push(input);
    if (input === "/demo-motion.recorded.json") {
      return options.fileMissing === true
        ? new Response("missing", { status: 404 })
        : new Response(RECORDED);
    }
    if (input === "/api/mode") return handleMode(readServerConfig(env));
    if (input === "/api/verify") verifyBodies.push(init?.body ?? "");
    return routes.fetch(input, init);
  };
}
async function mount(options: Options): Promise<Mounted> {
  const timers = createManualTimers();
  timers.clock.set(NOW);
  const storage = createMemoryStorage();
  storage.setItem(PANE_KEY, encodePreference(false));
  if (options.seed !== undefined) storage.setItem(AUTOSAVE_KEY, options.seed);
  const urls: string[] = [];
  const verifyBodies: string[] = [];
  const services: AppServices = {
    api: createApiClient(recordingFetch(options, urls, verifyBodies)),
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
    await new Promise((r) => setTimeout(r, 0));
  });
  return { storage, timers, urls, verifyBodies };
}
async function click(target: HTMLElement): Promise<void> {
  await act(async () => {
    fireEvent.click(target);
    await new Promise((r) => setTimeout(r, 0));
  });
}
const named = (name: string): HTMLElement => screen.getByRole("button", { name });
const result = (): string => screen.getByRole("status", { name: "Verify result" }).textContent;
const editorText = (): string => document.querySelector(".ProseMirror")?.textContent ?? "";
async function flush(m: Mounted): Promise<void> {
  await act(async () => {
    m.timers.advance(400);
    await new Promise((r) => setTimeout(r, 0));
  });
}
function saved(m: Mounted) {
  const restored = deserialise(m.storage.getItem(AUTOSAVE_KEY));
  if (!restored.ok) throw new Error("no saved document");
  return restored.value;
}
const recorded = () => {
  const r = deserialise(RECORDED);
  if (!r.ok) throw new Error("recorded sample did not restore");
  return r.value;
};
const apiRequests = (m: Mounted): string[] => m.urls.filter((u) => u.startsWith("/api/"));
const heavy = (m: Mounted): string[] =>
  apiRequests(m).filter((u) => /^\/api\/(verify|opinion|assistant)/u.test(u));
function pasted(text: string): Document {
  const created = createDocument("", ISO);
  if (!created.ok) throw new Error("fixture rejected");
  const applied = apply(created.value, {
    kind: "insert",
    at: 0,
    text,
    provenance: { origin: "PST", timestamp: ISO },
  });
  if (!applied.ok) throw new Error("fixture rejected");
  return applied.value.document;
}
/** Mounts with a non-empty stored draft so the Confirm_Dialog is reachable. */
function mountWithDraft(options: Omit<Options, "seed">): Promise<Mounted> {
  return mount({ ...options, seed: serialise(pasted(EARLIER), [], null, null) });
}

describe("Load demo motion installs the recording _Requirements: 3.1, 3.4, 3.5, 7.1_", () => {
  it("installs document, run log and check date on an empty draft with the notice", async () => {
    const m = await mount({ setting: "fixtures" });
    await click(named("Load demo motion"));
    await flush(m);
    expect(screen.getByText(RECORDED_SAMPLE_LOADED)).toBeTruthy();
    const r = recorded();
    expect(editorText()).toContain("Plaintiff Dana Whitfield, representing herself");
    const stored = saved(m);
    expect(stored.document.text).toBe(r.document.text);
    expect(stored.runLog).toEqual(r.runLog);
    expect(stored.verifiedAt).toBe(r.verifiedAt);
  });
  it("shows the recorded Checked date in the Issues_Region", async () => {
    const m = await mount({ setting: "fixtures" });
    await click(named("Load demo motion"));
    await flush(m);
    const at = recorded().verifiedAt;
    expect(at).not.toBeNull();
    expect(result()).toContain(`Checked ${localTime(at ?? "") ?? ""}`);
    expect(result()).toContain("Citations:");
  });
  it("the empty-page link installs the same recorded draft as the Toolbar button", async () => {
    const viaLink = await mount({ setting: "fixtures" });
    await click(screen.getByRole("link", { name: "Load demo motion" }));
    await flush(viaLink);
    const linkStored = viaLink.storage.getItem(AUTOSAVE_KEY);
    expect(screen.getByText(RECORDED_SAMPLE_LOADED)).toBeTruthy();
    document.body.innerHTML = "";
    const viaButton = await mount({ setting: "fixtures" });
    await click(named("Load demo motion"));
    await flush(viaButton);
    expect(linkStored).not.toBeNull();
    expect(linkStored).toBe(viaButton.storage.getItem(AUTOSAVE_KEY));
    expect(saved(viaLink).document.text).toBe(recorded().document.text);
  });
});

describe("Load demo motion on a non-empty draft _Requirements: 3.2, 3.3, 3.8_", () => {
  it("asks first, leaves the draft on Cancel, installs on Replace draft", async () => {
    const m = await mountWithDraft({ setting: "fixtures" });
    expect(editorText()).toContain(EARLIER);
    await loadDemo();
    const dialog = screen.getByRole("dialog", { name: "Load demo motion" });
    expect(m.urls).not.toContain("/demo-motion.recorded.json");
    await click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(editorText()).toContain(EARLIER);
    expect(m.urls).not.toContain("/demo-motion.recorded.json");
    await loadDemo();
    await click(named("Replace draft"));
    await flush(m);
    expect(screen.getByText(RECORDED_SAMPLE_LOADED)).toBeTruthy();
    expect(saved(m).document.text).toBe(recorded().document.text);
  });
  it("shows the failure notice and keeps the draft when the file is missing", async () => {
    const m = await mountWithDraft({ setting: "fixtures", fileMissing: true });
    await loadDemo();
    await click(named("Replace draft"));
    await flush(m);
    expect(screen.getByText(FAILED)).toBeTruthy();
    expect(screen.queryByText(RECORDED_SAMPLE_LOADED)).toBeNull();
    expect(editorText()).toContain(EARLIER);
    expect(saved(m).document.text).toContain(EARLIER);
  });
});

describe("Load makes no verification request _Requirements: 4.1_", () => {
  it.each(["fixtures", "live"] as const)(
    "sends no verify, opinion or assistant request in %s mode",
    async (setting) => {
      const m = await mount({ setting });
      await click(named("Load demo motion"));
      await flush(m);
      expect(screen.getByText(RECORDED_SAMPLE_LOADED)).toBeTruthy();
      expect(m.urls.filter((u) => u === "/demo-motion.recorded.json")).toHaveLength(1);
      expect(heavy(m)).toEqual([]);
      expect(apiRequests(m).every((u) => u === "/api/mode")).toBe(true);
    },
  );
});

describe("After the load _Requirements: 4.2, 4.3, 5.1, 5.2_", () => {
  it("Verify in Demo_Mode resolves from fixtures and replaces the Check_Date", async () => {
    const m = await mount({ setting: "fixtures" });
    await click(named("Load demo motion"));
    await flush(m);
    const before = recorded().verifiedAt ?? "";
    await click(within(screen.getByRole("toolbar")).getByRole("button", { name: "Verify" }));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 30));
    });
    expect(m.verifyBodies.length).toBeGreaterThan(0);
    const now = new Date(NOW).toISOString();
    expect(result()).toContain(`Checked ${localTime(now) ?? ""}`);
    expect(result()).not.toContain(`Checked ${localTime(before) ?? ""}`);
    expect(result()).not.toContain("not checked");
    await flush(m);
    const after = saved(m).verifiedAt ?? "";
    expect(after).not.toBe(before);
    expect(after.startsWith(now.slice(0, 16))).toBe(true);
  });
  it("holds no Declaration and Export asks the question", async () => {
    const m = await mount({ setting: "fixtures" });
    await click(named("Load demo motion"));
    await flush(m);
    expect(saved(m).declaration ?? null).toBeNull();
    await click(screen.getByRole("button", { name: /^Export/ }));
    const dialog = screen.getByRole("dialog", { name: "Export" });
    const radios = within(dialog).getAllByRole<HTMLInputElement>("radio");
    expect(radios).toHaveLength(2);
    expect(radios.every((r) => !r.checked)).toBe(true);
    expect(
      within(dialog).getByLabelText(
        /^Generative AI was used to prepare some or all of the pasted text/u,
      ),
    ).toBeTruthy();
  });
});
