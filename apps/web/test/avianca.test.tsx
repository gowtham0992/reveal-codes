// @vitest-environment jsdom
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { apply, createDocument } from "@reveal-codes/engine";
import type { Document } from "@reveal-codes/engine";
import { afterEach, describe, expect, it } from "vitest";
import type { ApiClient } from "../src/client/api";
import { AppShell } from "../src/components/app-shell";
import { PANE_KEY, encodePreference } from "../src/pane-preference";
import { AUTOSAVE_KEY, deserialise, serialise } from "../src/persist";
import type { AppServices } from "../src/services";
import { createManualTimers } from "./support/clock";
import type { ManualTimers } from "./support/clock";
import { createMemoryStorage } from "./support/memory-storage";
import type { MemoryStorage } from "./support/memory-storage";
import { modeApi } from "./support/mode-fetch";
import { act, fireEvent, renderUi, screen, within } from "./support/render";
import { createFakeViewport } from "./support/viewport";

const ISO = "2026-11-02T12:00:00.000Z";
const FIXTURE = resolve(__dirname, "../../../packages/engine/fixtures/avianca-citations.txt");
const SAMPLE = readFileSync(FIXTURE, "utf8");
const DEMO = readFileSync(
  resolve(__dirname, "../../../packages/engine/fixtures/demo-motion.txt"),
  "utf8",
);
const FAILED = "The Avianca citations could not be loaded. Your document is unchanged.";
const LINK_NAMES = ["Load demo motion", "Load the Avianca citations"];

function typed(text: string): Document {
  const created = createDocument("", ISO);
  if (!created.ok) throw new Error("fixture rejected");
  const applied = apply(created.value, {
    kind: "insert",
    at: 0,
    text,
    provenance: { origin: "HUM", timestamp: ISO },
  });
  if (!applied.ok) throw new Error("fixture rejected");
  return applied.value.document;
}

type Mounted = Readonly<{ storage: MemoryStorage; timers: ManualTimers }>;

function withSamples(base: ApiClient, reply: "fixture" | "fail"): ApiClient {
  const answer = (value: string) =>
    Promise.resolve(
      reply === "fail"
        ? { ok: false as const, error: { kind: "network" as const } }
        : { ok: true as const, value },
    );
  return { ...base, demoMotion: () => answer(DEMO), aviancaCitations: () => answer(SAMPLE) };
}

async function mount(stored: Document | null, reply: "fixture" | "fail" = "fixture") {
  const timers = createManualTimers();
  const storage = createMemoryStorage();
  storage.setItem(PANE_KEY, encodePreference(false));
  if (stored !== null) storage.setItem(AUTOSAVE_KEY, serialise(stored, [], null));
  const services: AppServices = {
    api: withSamples(modeApi("fixtures").api, reply),
    now: timers.clock.now,
    setTimer: (fn, ms) => timers.setTimeout(fn, ms),
    clearTimer: (h) => {
      timers.clearTimeout(h as number);
    },
    storage,
    download: () => undefined,
    openPrint: () => true,
    viewport: createFakeViewport(),
  };
  await act(async () => {
    renderUi(<AppShell services={services} />);
    await Promise.resolve();
  });
  return { storage, timers } satisfies Mounted;
}

function main(): HTMLElement {
  return screen.getByRole("main");
}
function sampleLinks(): HTMLAnchorElement[] {
  return within(main()).queryAllByRole("link");
}
function editorText(): string {
  return screen.getByRole("textbox", { name: "Document" }).textContent;
}
function noticeText(): string {
  return within(screen.getByRole("toolbar")).getByRole("status").textContent;
}

describe("copy-demo with no argument _Requirements: 10.6_", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  });

  it("copies the Avianca sample byte for byte to public, and exits zero", () => {
    const run = spawnSync(
      process.execPath,
      ["--import", "jiti/register", join(__dirname, "../scripts/copy-demo.ts")],
      { encoding: "utf8", cwd: join(__dirname, "..") },
    );
    expect(run.status).toBe(0);
    const copied = readFileSync(join(__dirname, "../public/avianca-citations.txt"));
    expect(copied.equals(readFileSync(FIXTURE))).toBe(true);
    const demo = readFileSync(join(__dirname, "../public/demo-motion.txt"));
    expect(demo.equals(Buffer.from(DEMO, "utf8"))).toBe(true);
  });

  it("keeps the explicit-argument behaviour", () => {
    const dir = mkdtempSync(join(tmpdir(), "avianca-copy-"));
    dirs.push(dir);
    const dest = join(dir, "out.txt");
    const run = spawnSync(
      process.execPath,
      ["--import", "jiti/register", join(__dirname, "../scripts/copy-demo.ts"), FIXTURE, dest],
      { encoding: "utf8", cwd: join(__dirname, "..") },
    );
    expect(run.status).toBe(0);
    expect(readFileSync(dest).equals(readFileSync(FIXTURE))).toBe(true);
  });
});

describe("Empty-page sample links _Requirements: 10.7, 10.8, 10.9, 10.10_", () => {
  it("shows the two links in order, as focusable anchors outside the aria-hidden placeholder", async () => {
    await mount(null);
    const links = sampleLinks();
    expect(links.map((l) => l.textContent)).toEqual(LINK_NAMES);
    for (const l of links) {
      expect(l.tagName).toBe("A");
      expect(l.getAttribute("href")).not.toBeNull();
      expect(l.tabIndex).toBeGreaterThanOrEqual(0);
      expect(l.closest('[aria-hidden="true"]')).toBeNull();
      expect(l.querySelector("img, svg")).toBeNull();
    }
    expect(screen.getByText(/^Type or paste your filing here/u).getAttribute("aria-hidden")).toBe(
      "true",
    );
    act(() => {
      links[0]?.focus();
    });
    expect(document.activeElement).toBe(links[0]);
    act(() => {
      links[1]?.focus();
    });
    expect(document.activeElement).toBe(links[1]);
  });

  it("renders neither link when text exists", async () => {
    await mount(typed("My draft."));
    expect(sampleLinks()).toEqual([]);
  });

  it("removes the links once the Avianca sample is loaded", async () => {
    await mount(null);
    await act(async () => {
      fireEvent.click(screen.getByRole("link", { name: "Load the Avianca citations" }));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(sampleLinks()).toEqual([]);
  });
});

describe("Loading the Avianca sample _Requirements: 10.11, 10.12_", () => {
  it("installs the sample as one PST span over the whole text", async () => {
    const m = await mount(null);
    await act(async () => {
      fireEvent.click(screen.getByRole("link", { name: "Load the Avianca citations" }));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.queryByRole("dialog")).toBeNull();
    await act(async () => {
      m.timers.advance(400);
      await new Promise((r) => setTimeout(r, 0));
    });
    const restored = deserialise(m.storage.getItem(AUTOSAVE_KEY));
    if (!restored.ok) throw new Error("no saved document");
    const doc = restored.value.document;
    expect(doc.text).toBe(SAMPLE);
    expect(doc.spans).toHaveLength(1);
    expect(doc.spans[0]?.provenance.origin).toBe("PST");
    expect(doc.spans[0]?.start).toBe(0);
    expect(doc.spans[0]?.end).toBe(SAMPLE.length);
  });
});

describe("A failed Avianca fetch _Requirements: 10.13, 13.5_", () => {
  it("sets the plain notice, shows no dialog and leaves the empty page as it was", async () => {
    await mount(null, "fail");
    await act(async () => {
      fireEvent.click(screen.getByRole("link", { name: "Load the Avianca citations" }));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(noticeText()).toBe(FAILED);
    expect(editorText()).toBe("");
    expect(sampleLinks().map((l) => l.textContent)).toEqual(LINK_NAMES);
  });
});
