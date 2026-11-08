// @vitest-environment jsdom
import { apply, createDocument } from "@reveal-codes/engine";
import type { Document } from "@reveal-codes/engine";
import { describe, expect, it } from "vitest";
import { AppShell } from "../src/components/app-shell";
import { AUTOSAVE_KEY, serialise } from "../src/persist";
import type { AppServices } from "../src/services";
import { createManualTimers } from "./support/clock";
import { createMemoryStorage } from "./support/memory-storage";
import type { MemoryStorage } from "./support/memory-storage";
import { act, renderUi, screen, within } from "./support/render";

const ISO = "2026-11-02T12:00:00.000Z";

function storedDocument(text: string): Document {
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

type Fixture = { services: AppServices; storage: MemoryStorage };

function fixture(storage: MemoryStorage = createMemoryStorage()): Fixture {
  const timers = createManualTimers();
  const services: AppServices = {
    now: timers.clock.now,
    setTimer: (fn, ms) => timers.setTimeout(fn, ms),
    clearTimer: (h) => {
      timers.clearTimeout(h as number);
    },
    storage,
  };
  return { services, storage };
}

async function mount(f: Fixture): Promise<void> {
  await act(async () => {
    renderUi(<AppShell services={f.services} />);
    await Promise.resolve();
  });
}

describe("AppShell _Requirements: 6.5, 6.6, 9.3, 10.1, 10.2, 10.15, 25.6_", () => {
  it("lays out the toolbar, main region and Issues region in that order, with no left column", async () => {
    await mount(fixture());
    const app = document.querySelector(".app");
    if (app === null) throw new Error("no .app root");
    const roles = [...app.children].map((c) => c.getAttribute("role") ?? c.tagName.toLowerCase());
    expect(roles).toEqual(["toolbar", "main", "aside"]);
    expect(screen.getByRole("complementary", { name: "Issues" })).not.toBeNull();
    expect(screen.queryByRole("region", { name: "Reveal Codes" })).toBeNull();
    expect(screen.queryByRole("complementary", { name: "Assistant" })).toBeNull();
  });

  it("renders the toolbar buttons in order with Verify and Export inert and disabled", async () => {
    await mount(fixture());
    const bar = screen.getByRole("toolbar");
    const buttons = within(bar).getAllByRole("button");
    expect(buttons.map((b) => b.textContent)).toEqual([
      "New",
      "Load demo motion",
      "Verify",
      "Reveal Codes (Alt-F3)",
      "Export",
    ]);
    expect(
      buttons.filter((b) => (b as HTMLButtonElement).disabled).map((b) => b.textContent),
    ).toEqual(["Verify", "Export"]);
  });

  it("exposes the Document textbox and an empty, polite status area", async () => {
    await mount(fixture());
    expect(screen.getByRole("textbox", { name: "Document" })).not.toBeNull();
    const status = screen.getByRole("status");
    expect(status.textContent).toBe("");
    expect(status.getAttribute("aria-live")).toBe("polite");
  });

  it("installs a stored Document on mount and hides the placeholder", async () => {
    const storage = createMemoryStorage();
    storage.setItem(AUTOSAVE_KEY, serialise(storedDocument("Stored draft."), []));
    await mount(fixture(storage));
    expect(screen.queryByText(/Paste your draft here/)).toBeNull();
    expect(screen.getByRole("textbox", { name: "Document" }).textContent).toBe("Stored draft.");
  });

  it("starts empty when the stored value is corrupt", async () => {
    const storage = createMemoryStorage();
    storage.setItem(AUTOSAVE_KEY, "{not json");
    await mount(fixture(storage));
    expect(screen.getByText("Paste your draft here, or start typing.")).not.toBeNull();
    expect(screen.getByRole("textbox", { name: "Document" }).textContent).toBe("");
  });

  it("starts empty when reading storage throws", async () => {
    const storage = createMemoryStorage();
    storage.getItem = () => {
      throw new Error("SecurityError");
    };
    await mount(fixture(storage));
    expect(screen.getByText("Paste your draft here, or start typing.")).not.toBeNull();
  });
});
