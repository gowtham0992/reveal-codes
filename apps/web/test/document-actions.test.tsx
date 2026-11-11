// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { apply, createDocument } from "@reveal-codes/engine";
import type { Document } from "@reveal-codes/engine";
import { cleanup } from "@testing-library/react";
import { describe, expect, it } from "vitest";
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

const ISO = "2026-11-02T12:00:00.000Z";

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

type Mounted = Readonly<{
  storage: MemoryStorage;
  timers: ManualTimers;
  gate: { current: Promise<void> | null };
}>;

type DemoReply = "fixture" | "fail";

function apiWithDemo(base: ApiClient, reply: DemoReply): ApiClient {
  return {
    ...base,
    demoMotion: () =>
      Promise.resolve(
        reply === "fail"
          ? { ok: false as const, error: { kind: "network" as const } }
          : { ok: true as const, value: DEMO },
      ),
  };
}

/** `pane` is the stored Pane_Preference; the default keeps the Pane closed as these examples expect. */
async function mount(
  stored: Document | null,
  reply: DemoReply = "fixture",
  pane: boolean | null = false,
): Promise<Mounted> {
  const timers = createManualTimers();
  const storage = createMemoryStorage();
  if (pane !== null) storage.setItem(PANE_KEY, encodePreference(pane));
  if (stored !== null) storage.setItem(AUTOSAVE_KEY, serialise(stored, [], null));
  const mode = modeApi("fixtures");
  const services: AppServices = {
    api: apiWithDemo(mode.api, reply),
    now: timers.clock.now,
    setTimer: (fn, ms) => timers.setTimeout(fn, ms),
    clearTimer: (h) => {
      timers.clearTimeout(h as number);
    },
    storage,
    download: () => undefined,
    openPrint: () => true,
  };
  await act(async () => {
    renderUi(<AppShell services={services} />);
    await Promise.resolve();
  });
  return { storage, timers, gate: mode.gate };
}

async function click(name: string): Promise<void> {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name }));
    await Promise.resolve();
  });
}

async function flush(m: Mounted): Promise<void> {
  await act(async () => {
    m.timers.advance(400);
    await new Promise((r) => setTimeout(r, 0));
  });
}

function savedDocument(m: Mounted): Document {
  const restored = deserialise(m.storage.getItem(AUTOSAVE_KEY));
  if (!restored.ok) throw new Error("no saved document");
  return restored.value.document;
}

function noticeText(): string {
  return within(screen.getByRole("toolbar")).getByRole("status").textContent;
}
function editorText(): string {
  return screen.getByRole("textbox", { name: "Document" }).textContent;
}

const DEMO = readFileSync(
  resolve(__dirname, "../../../packages/engine/fixtures/demo-motion.txt"),
  "utf8",
);

describe("New _Requirements: 20.1, 20.2, 20.3_", () => {
  it("always confirms, even for an empty draft, and cancel keeps the draft", async () => {
    await mount(typed("My draft."));
    await click("New");
    expect(screen.getByRole("dialog", { name: "New document" })).not.toBeNull();
    await click("Cancel");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(editorText()).toBe("My draft.");
  });

  it("asks even when the draft is empty", async () => {
    await mount(null);
    await click("New");
    expect(screen.getByRole("dialog", { name: "New document" })).not.toBeNull();
  });

  it("confirming empties the draft and removes the autosave key", async () => {
    const m = await mount(typed("My draft."));
    await click("New");
    await click("Discard and start new");
    expect(editorText()).toBe("");
    await flush(m);
    expect(m.storage.getItem(AUTOSAVE_KEY)).toBeNull();
  });
});

describe("New and the Pane_Preference _Requirements: 1.9, 12.1_", () => {
  it.each([true, false])("leaves the stored preference %s untouched", async (open) => {
    const m = await mount(typed("My draft."), "fixture", open);
    await click("New");
    await click("Discard and start new");
    expect(m.storage.getItem(PANE_KEY)).toBe(encodePreference(open));
    expect(screen.queryByRole("region", { name: "Reveal Codes" }) !== null).toBe(open);
  });
});

describe("Load demo motion _Requirements: 20.1, 20.2, 20.4, 20.5_", () => {
  it("loads without a dialog when the draft is empty, as one PST span over the fixture text", async () => {
    const m = await mount(null);
    await click("Load demo motion");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(editorText().replace(/\s+/g, " ")).toContain(DEMO.slice(0, 20).replace(/\s+/g, " "));
    await flush(m);
    const doc = savedDocument(m);
    expect(doc.text).toBe(DEMO);
    expect(doc.spans.length).toBeGreaterThan(0);
    expect(doc.spans.every((s) => s.provenance.origin === "PST")).toBe(true);
    expect(doc.spans[0]?.start).toBe(0);
    expect(doc.spans[doc.spans.length - 1]?.end).toBe(DEMO.length);
  });

  it("shows [PST] and no [AI in the Pane", async () => {
    await mount(null);
    await click("Load demo motion");
    await click("Show codes (Alt-F3)");
    const pane = screen.getByRole("region", { name: "Reveal Codes" });
    const labels = [...pane.querySelectorAll('[role="img"]')].map((e) =>
      e.getAttribute("aria-label"),
    );
    expect(labels).toContain("Pasted or from outside the editor");
    expect(labels.some((l) => l?.toLowerCase().includes("assistant"))).toBe(false);
    // The Pane_Header Legend names [AI], so scan only the scrolling body (header, body, status).
    const [header, body] = [pane.children[0], pane.children[1]];
    expect(header?.textContent).toContain("Reveal Codes");
    expect(header?.textContent).toContain("[AI");
    expect(body?.textContent).toContain("[PST");
    expect(body?.textContent).not.toContain("[AI");
  });

  it("confirms when the draft is non-empty; cancel keeps it, confirm replaces it", async () => {
    await mount(typed("My draft."));
    await click("Load demo motion");
    expect(screen.getByRole("dialog", { name: "Load demo motion" })).not.toBeNull();
    await click("Cancel");
    expect(editorText()).toBe("My draft.");
    await click("Load demo motion");
    await click("Replace draft");
    expect(editorText()).not.toContain("My draft.");
    expect(editorText().length).toBeGreaterThan(100);
  });

  it("a failed fetch keeps the draft and sets a plain notice", async () => {
    await mount(typed("My draft."), "fail");
    await click("Load demo motion");
    await click("Replace draft");
    expect(editorText()).toBe("My draft.");
    expect(noticeText()).toBe("Could not load the demo motion.");
  });
});

describe("Verify flow and New _Requirements: 20.6_", () => {
  it("discards a flow that finishes after New", async () => {
    const m = await mount(null);
    await click("Load demo motion");
    let release: () => void = () => undefined;
    m.gate.current = new Promise<void>((resolve) => {
      release = resolve;
    });
    await click("Verify");
    await click("New");
    await click("Discard and start new");
    await act(async () => {
      release();
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(editorText()).toBe("");
    expect(noticeText()).toBe("");
    await flush(m);
    expect(m.storage.getItem(AUTOSAVE_KEY)).toBeNull();
  });
});
function verifyResult(): string {
  return screen.getByRole("status", { name: "Verify result" }).textContent;
}
describe("Verify_Summary lifecycle _Requirements: 5.2, 5.4, 5.5, 5.14, 5.15, 5.16_", () => {
  it("is empty before a run, filled after it, and cleared by New and by Load demo motion", async () => {
    const m = await mount(null);
    await click("Load demo motion");
    expect(verifyResult()).toBe("");
    await click("Verify");
    await act(async () => {
      await new Promise((r) => setTimeout(r, 30));
    });
    expect(verifyResult()).toContain("Citations:");
    await click("Load demo motion");
    await click("Replace draft");
    expect(verifyResult()).toBe("");
    await click("Verify");
    await act(async () => {
      await new Promise((r) => setTimeout(r, 30));
    });
    expect(verifyResult()).toContain("Citations:");
    await click("New");
    await click("Discard and start new");
    expect(verifyResult()).toBe("");
    await flush(m);
  });
  it("keeps the counts after a reload and drops the further line", async () => {
    const m = await mount(null);
    await click("Load demo motion");
    await click("Verify");
    await act(async () => {
      await new Promise((r) => setTimeout(r, 30));
    });
    const before = verifyResult();
    await flush(m);
    cleanup();
    const timers = createManualTimers();
    const mode = modeApi("fixtures");
    await act(async () => {
      renderUi(
        <AppShell
          services={{
            api: apiWithDemo(mode.api, "fixture"),
            now: timers.clock.now,
            setTimer: (fn, ms) => timers.setTimeout(fn, ms),
            clearTimer: (h) => {
              timers.clearTimeout(h as number);
            },
            storage: m.storage,
            download: () => undefined,
            openPrint: () => true,
          }}
        />,
      );
      await Promise.resolve();
    });
    const after = verifyResult();
    expect(after).toContain("Citations:");
    expect(after).toBe(before.replace(/Some items were.*$/, ""));
  });
});
