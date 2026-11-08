// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { DEFAULT_RELABEL_THRESHOLD, apply, createDocument } from "@reveal-codes/engine";
import type { Editor } from "@tiptap/core";
import { describe, expect, it } from "vitest";
import { AppShell } from "../src/components/app-shell";
import { DRAFT_EMPTY, DRAFT_FAILED } from "../src/components/use-assistant";
import { offsetToPos } from "../src/editor/offsets";
import { AUTOSAVE_KEY, serialise } from "../src/persist";
import type { AppServices } from "../src/services";
import { assistantFetch } from "./support/assistant-fetch";
import type { AssistantFetch } from "./support/assistant-fetch";
import { createManualTimers } from "./support/clock";
import type { ManualTimers } from "./support/clock";
import { createMemoryStorage } from "./support/memory-storage";
import type { MemoryStorage } from "./support/memory-storage";
import { act, fireEvent, renderUi, screen, waitFor } from "./support/render";

const ISO = "2026-11-02T12:00:00.000Z";
const FULL_REPLY = readFileSync(resolve(__dirname, "../fixtures/assistant/default.txt"), "utf8");
const REPLY =
  "The plaintiff respectfully asks the Court to deny the defendant's motion to dismiss.";

type Fixture = {
  services: AppServices;
  server: AssistantFetch;
  storage: MemoryStorage;
  t: ManualTimers;
};

function seeded(text: string): MemoryStorage {
  const storage = createMemoryStorage();
  const created = createDocument("", ISO);
  if (!created.ok || text === "") return storage;
  const applied = apply(created.value, {
    kind: "insert",
    at: 0,
    text,
    provenance: { origin: "HUM", timestamp: ISO },
  });
  if (applied.ok) storage.setItem(AUTOSAVE_KEY, serialise(applied.value.document, []));
  return storage;
}

async function mount(text = ""): Promise<Fixture> {
  const t = createManualTimers();
  const server = assistantFetch();
  const storage = seeded(text);
  const services: AppServices = {
    api: server.api,
    now: t.clock.now,
    setTimer: (fn, ms) => t.setTimeout(fn, ms),
    clearTimer: (h) => {
      t.clearTimeout(h as number);
    },
    storage,
  };
  await act(async () => {
    renderUi(<AppShell services={services} />);
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  return { services, server, storage, t };
}

function editorOf(): Editor {
  const el: HTMLElement & { editor?: Editor } = screen.getByRole("textbox", { name: "Document" });
  if (el.editor === undefined) throw new Error("no editor on the textbox");
  return el.editor;
}

function setCaret(offset: number): void {
  const editor = editorOf();
  const pos = offsetToPos(editor.state.doc, offset);
  if (pos === null) throw new Error("offset has no position");
  act(() => {
    editor.commands.setTextSelection(pos);
  });
}

function openPanel(): void {
  fireEvent.click(screen.getByRole("button", { name: "Assistant" }));
}

function startDraft(prompt: string): void {
  fireEvent.change(screen.getByLabelText("Prompt"), { target: { value: prompt } });
  fireEvent.click(screen.getByRole("button", { name: "Draft" }));
}

async function finished(): Promise<void> {
  await waitFor(() => {
    expect(screen.queryByRole("button", { name: "Stop" })).toBeNull();
  });
}

function runLogOf(f: Fixture): readonly {
  runId: string;
  provider: string;
  modelId: unknown;
  prompt: string;
  timestamp: string;
}[] {
  act(() => {
    f.t.advance(300);
  });
  const stored: unknown = JSON.parse(f.storage.getItem(AUTOSAVE_KEY) ?? "{}");
  const log = (stored as { runLog?: unknown }).runLog;
  return Array.isArray(log) ? (log as never) : [];
}

function paneText(): string {
  return screen.getByRole("region", { name: "Reveal Codes" }).textContent;
}

function openPane(): void {
  act(() => {
    fireEvent.keyDown(document.body, { key: "F3", altKey: true, bubbles: true, cancelable: true });
  });
}

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve: () => void = () => undefined;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe("AssistantPanel _Requirements: 7.8, 10.8, 10.15, 23.1 to 23.9_", () => {
  it("is collapsed on first load behind an Assistant disclosure button, then expands", async () => {
    await mount();
    const button = screen.getByRole("button", { name: "Assistant" });
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(document.querySelector(".app")?.getAttribute("data-assistant")).toBe("closed");
    expect(screen.queryByLabelText("Prompt")).toBeNull();
    openPanel();
    expect(button.getAttribute("aria-expanded")).toBe("true");
    expect(document.querySelector(".app")?.getAttribute("data-assistant")).toBe("open");
    expect(
      screen.getByText("Demo mode: replies are recorded and nothing is sent to a model."),
    ).not.toBeNull();
  });

  it("streams into the panel, keeps it out of the Document until the end, then inserts one AI span at the cursor", async () => {
    const f = await mount("Alpha\nBeta");
    openPane();
    setCaret(5);
    openPanel();
    const hold = deferred();
    f.server.gate.current = hold.promise;
    startDraft("  Write a reply  ");
    await waitFor(() => {
      expect(screen.getByRole("log").textContent).not.toBe("");
    });
    expect(screen.getByRole("button", { name: "Stop" })).not.toBeNull();
    expect(editorOf().getText()).not.toContain("plaintiff");
    expect(paneText()).not.toContain("[AI:");
    hold.resolve();
    await finished();
    const text = editorOf().state.doc.textBetween(0, editorOf().state.doc.content.size, "\n");
    expect(text.startsWith(`Alpha\n${REPLY}`)).toBe(true);
    expect(text.endsWith("\nBeta")).toBe(true);
    expect(text.split("\n")).toHaveLength(3);
    expect(paneText()).toMatch(/\[HUM\]Alpha\[AI:r1\]\s+The plaintiff respectfully/);
    expect(paneText().indexOf("[AI:r1]")).toBeGreaterThan(paneText().indexOf("Alpha"));
    expect(paneText().indexOf("[AI:r1]")).toBeLessThan(paneText().indexOf("Beta"));
    const body: unknown = JSON.parse(f.server.bodies[0] ?? "{}");
    expect(body).toEqual({ prompt: "Write a reply", context: "Alpha" });
    const stamp = f.t.clock.now().toISOString();
    const log = runLogOf(f);
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({
      runId: "r1",
      provider: "fixture",
      modelId: null,
      prompt: "Write a reply",
      timestamp: stamp,
    });
  });

  it("gives a second draft run id r2", async () => {
    const f = await mount();
    openPane();
    openPanel();
    startDraft("one");
    await finished();
    startDraft("two");
    await finished();
    expect(paneText()).toContain("[AI:r1]");
    expect(paneText()).toContain("[AI:r2]");
    expect(runLogOf(f).map((r) => r.runId)).toEqual(["r1", "r2"]);
  });

  it("inserts nothing when Stop is pressed", async () => {
    const f = await mount("Alpha");
    openPanel();
    f.server.gate.current = deferred().promise;
    startDraft("one");
    await waitFor(() => {
      expect(screen.getByRole("log").textContent).not.toBe("");
    });
    fireEvent.click(screen.getByRole("button", { name: "Stop" }));
    await finished();
    expect(editorOf().getText()).toBe("Alpha");
    expect(runLogOf(f)).toEqual([]);
    expect(screen.getByRole("button", { name: "Draft" })).not.toBeNull();
  });

  it("discards a draft that finishes after New replaced the Document", async () => {
    const f = await mount("Alpha");
    openPanel();
    const hold = deferred();
    f.server.gate.current = hold.promise;
    startDraft("one");
    await waitFor(() => {
      expect(screen.getByRole("log").textContent).not.toBe("");
    });
    fireEvent.click(screen.getByRole("button", { name: "New" }));
    fireEvent.click(screen.getByRole("button", { name: "Discard and start new" }));
    hold.resolve();
    await finished();
    expect(editorOf().getText()).toBe("");
    expect(runLogOf(f)).toEqual([]);
  });

  it("inserts nothing and sets a Notice on a failed or empty reply", async () => {
    const f = await mount("Alpha");
    openPanel();
    f.server.override.current = () => new Response("down", { status: 502 });
    startDraft("one");
    await waitFor(() => {
      expect(screen.getAllByText(DRAFT_FAILED).length).toBeGreaterThan(0);
    });
    f.server.override.current = () => new Response("  \n ", { status: 200 });
    startDraft("two");
    await waitFor(() => {
      expect(screen.getAllByText(DRAFT_EMPTY).length).toBeGreaterThan(0);
    });
    expect(editorOf().getText()).toBe("Alpha");
    expect(runLogOf(f)).toEqual([]);
  });

  it("sends only the paragraph at the cursor as context", async () => {
    const f = await mount("First paragraph.\nSecond paragraph.");
    setCaret(20);
    openPanel();
    startDraft("one");
    await finished();
    const body = JSON.parse(f.server.bodies[0] ?? "{}") as { context?: string };
    expect(body.context).toBe("Second paragraph.");
  });

  it("shows AI>HUM from the Engine, with no app code, once the author edits past the threshold", async () => {
    const f = await mount();
    openPane();
    openPanel();
    startDraft("one");
    await finished();
    expect(f.server.bodies).toHaveLength(1);
    const editor = editorOf();
    const length = FULL_REPLY.length;
    const cut = Math.ceil(length * (DEFAULT_RELABEL_THRESHOLD + 0.2));
    const from = offsetToPos(editor.state.doc, 0);
    const to = offsetToPos(editor.state.doc, cut);
    if (from === null || to === null) throw new Error("no positions");
    act(() => {
      editor.commands.deleteRange({ from, to });
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(paneText()).toContain("[AI>HUM:r1]");
  });
});
