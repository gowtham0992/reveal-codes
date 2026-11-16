// @vitest-environment jsdom
// Task 10.1: every sample and New leaves the Declaration Pending (null) and the Export dialog asks.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { apply, createDocument, declareAi } from "@reveal-codes/engine";
import type { Declaration, Document } from "@reveal-codes/engine";
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
import { createFakeViewport } from "./support/viewport";

const ISO = "2026-11-02T12:00:00.000Z";
const FIXTURES = resolve(__dirname, "../../../packages/engine/fixtures");
const DEMO = readFileSync(resolve(FIXTURES, "demo-motion.txt"), "utf8");
const AVIANCA = readFileSync(resolve(FIXTURES, "avianca-citations.txt"), "utf8");

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

type Mounted = Readonly<{ storage: MemoryStorage; timers: ManualTimers }>;

function withSamples(base: ApiClient): ApiClient {
  const answer = (value: string) => Promise.resolve({ ok: true as const, value });
  return { ...base, demoMotion: () => answer(DEMO), aviancaCitations: () => answer(AVIANCA) };
}

function declared(): Declaration {
  const made = declareAi("pasted_text", "ChatGPT");
  if (!made.ok) throw new Error("fixture rejected");
  return made.value;
}

async function mount(seed: Declaration | null): Promise<Mounted> {
  const timers = createManualTimers();
  const storage = createMemoryStorage();
  storage.setItem(PANE_KEY, encodePreference(false));
  if (seed !== null) {
    storage.setItem(AUTOSAVE_KEY, serialise(pasted("Earlier pasted text."), [], null, seed));
  }
  const services: AppServices = {
    api: withSamples(modeApi("fixtures").api),
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
  return { storage, timers };
}

async function click(target: HTMLElement): Promise<void> {
  await act(async () => {
    fireEvent.click(target);
    await Promise.resolve();
    await Promise.resolve();
  });
}

const named = (name: string): HTMLElement => screen.getByRole("button", { name });

async function flush(m: Mounted): Promise<void> {
  await act(async () => {
    m.timers.advance(400);
    await new Promise((r) => setTimeout(r, 0));
  });
}

function savedDeclaration(m: Mounted): Declaration | null {
  const restored = deserialise(m.storage.getItem(AUTOSAVE_KEY));
  if (!restored.ok) throw new Error("no saved document");
  return restored.value.declaration ?? null;
}

async function expectDialogAsks(): Promise<void> {
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
  expect(within(dialog).getByRole("button", { name: "Download .docx" })).toHaveProperty(
    "disabled",
    true,
  );
  expect(within(dialog).getByRole("button", { name: "Open print view" })).toHaveProperty(
    "disabled",
    true,
  );
}

describe("Samples leave the Declaration Pending _Requirements: 10.1, 10.2_", () => {
  it("Load demo motion clears a stored Declaration and the dialog asks", async () => {
    const m = await mount(declared());
    await click(named("Load demo motion"));
    await click(named("Replace draft"));
    await flush(m);
    expect(savedDeclaration(m)).toBeNull();
    await expectDialogAsks();
  });

  it("Load the Avianca citations leaves the Declaration null and the dialog asks", async () => {
    const m = await mount(null);
    await click(screen.getByRole("link", { name: "Load the Avianca citations" }));
    await flush(m);
    expect(savedDeclaration(m)).toBeNull();
    await expectDialogAsks();
  });

  it("New discards a stored Declaration", async () => {
    const m = await mount(declared());
    expect(savedDeclaration(m)).toEqual(declared());
    await click(named("New"));
    await click(named("Discard and start new"));
    await flush(m);
    expect(m.storage.getItem(AUTOSAVE_KEY)).toBeNull();
  });
});
