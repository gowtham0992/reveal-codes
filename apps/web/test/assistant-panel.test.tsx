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
  if (applied.ok) storage.setItem(AUTOSAVE_KEY, serialise(applied.value.document, [], null));
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
    download: () => undefined,
    openPrint: () => true,
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

/** The Pane opens on first visit; press Alt-F3 only when it is not already showing. */
function openPane(): void {
  if (screen.queryByRole("region", { name: "Reveal Codes" }) !== null) return;
  act(() => {
    fireEvent.keyDown(document.body, { key: "F3", altKey: true, bubbles: true, cancelable: true });
  });
}

/** A reply that sends no bytes until `fail` errors the stream (what a real abort does). */
function silentReply(): { response: Response; fail: () => void } {
  const held: { ctrl?: ReadableStreamDefaultController<Uint8Array> } = {};
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      held.ctrl = c;
    },
  });
  return {
    response: new Response(body, { status: 200 }),
    fail: () => {
      held.ctrl?.error(new Error("aborted"));
    },
  };
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
    expect(screen.getByRole("heading", { name: "Assistant" })).not.toBeNull();
    expect(screen.getAllByRole("button", { name: "Assistant" })).toHaveLength(1);
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

  it("inserts the partial reply when Stop is pressed after some text arrived", async () => {
    const f = await mount("Alpha");
    openPanel();
    f.server.gate.current = deferred().promise;
    startDraft("one");
    await waitFor(() => {
      expect(screen.getByRole("log").textContent).not.toBe("");
    });
    const partial = screen.getByRole("log").textContent;
    fireEvent.click(screen.getByRole("button", { name: "Stop" }));
    await finished();
    expect(editorOf().getText()).toContain(partial);
    expect(runLogOf(f).map((r) => r.runId)).toEqual(["r1"]);
    expect(screen.getByRole("log").textContent).toBe(partial);
    expect(
      screen.getByText(/^Stopped\. Partial reply inserted at Ln \d+ as run r1$/),
    ).not.toBeNull();
    expect(screen.queryByText(/^Inserted at/)).toBeNull();
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

async function draftAt(text: string, caret: number): Promise<Fixture> {
  const f = await mount(text);
  setCaret(caret);
  openPanel();
  startDraft("one");
  await finished();
  return f;
}

describe("AssistantPanel lines and Reply_Box _Requirements: 7.1 to 7.15_", () => {
  it("shows where the reply will go, following the caret and the pane status line", async () => {
    await mount("Alpha\nBeta");
    openPane();
    openPanel();
    setCaret(8);
    expect(screen.getByText("Inserts at the cursor: Ln 2 Pos 3")).not.toBeNull();
    expect(paneText()).toContain("Ln 2 Pos 3");
    setCaret(2);
    expect(screen.getByText("Inserts at the cursor: Ln 1 Pos 3")).not.toBeNull();
    expect(paneText()).toContain("Ln 1 Pos 3");
  });

  it("has no Reply_Box before the first run, then labels it Last reply", async () => {
    await mount("Alpha");
    openPanel();
    expect(screen.queryByRole("log")).toBeNull();
    expect(screen.queryByText("Last reply")).toBeNull();
    startDraft("one");
    await finished();
    expect(screen.getByRole("log", { name: "Last reply" })).not.toBeNull();
    expect(screen.queryByLabelText("Streamed reply")).toBeNull();
  });

  it("keeps the reply text and reports the line of the first inserted character", async () => {
    await draftAt("Alpha\nBeta", 6);
    expect(screen.getByRole("log").textContent).toBe(FULL_REPLY.trim());
    expect(screen.getByText("Inserted at Ln 2 as run r1")).not.toBeNull();
    expect(screen.queryByText(/^Stopped/)).toBeNull();
  });

  it("counts the separating newline mid-paragraph", async () => {
    await draftAt("Alpha\nBeta", 2);
    expect(screen.getByText("Inserted at Ln 2 as run r1")).not.toBeNull();
  });

  it("reports the line after the last one at the end of the text", async () => {
    await draftAt("Alpha\nBeta", 10);
    expect(screen.getByText("Inserted at Ln 3 as run r1")).not.toBeNull();
  });

  it("removes the line when a new run starts", async () => {
    const f = await draftAt("Alpha", 0);
    expect(screen.getByText(/^Inserted at Ln 1 as run r1$/)).not.toBeNull();
    f.server.gate.current = deferred().promise;
    startDraft("two");
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Stop" })).not.toBeNull();
    });
    expect(screen.queryByText(/^Inserted at/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Stop" }));
    await finished();
  });

  it("shows no line after a failed or empty run", async () => {
    const f = await mount("Alpha");
    openPanel();
    f.server.override.current = () => new Response("down", { status: 502 });
    startDraft("one");
    await waitFor(() => {
      expect(screen.getAllByText(DRAFT_FAILED).length).toBeGreaterThan(0);
    });
    expect(screen.queryByText(/Inserted at/)).toBeNull();
    f.server.override.current = () => new Response("  \n ", { status: 200 });
    startDraft("two");
    await waitFor(() => {
      expect(screen.getAllByText(DRAFT_EMPTY).length).toBeGreaterThan(0);
    });
    expect(screen.queryByText(/Inserted at/)).toBeNull();
    expect(screen.getByRole("log").textContent).toBe("");
  });

  it("shows neither line and no box when the first run is stopped with nothing inserted", async () => {
    const f = await mount("Alpha");
    openPanel();
    const silent = silentReply();
    f.server.override.current = () => silent.response;
    startDraft("one");
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Stop" })).not.toBeNull();
    });
    fireEvent.click(screen.getByRole("button", { name: "Stop" }));
    silent.fail();
    await finished();
    expect(screen.queryByRole("log")).toBeNull();
    expect(screen.queryByText(/Inserted at/)).toBeNull();
    expect(editorOf().getText()).toBe("Alpha");
  });

  it("keeps an empty box, without the earlier text, when a later run is stopped with nothing", async () => {
    const f = await draftAt("Alpha", 0);
    expect(screen.getByRole("log").textContent).toBe(FULL_REPLY.trim());
    const silent = silentReply();
    f.server.override.current = () => silent.response;
    startDraft("two");
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Stop" })).not.toBeNull();
    });
    fireEvent.click(screen.getByRole("button", { name: "Stop" }));
    silent.fail();
    await finished();
    expect(screen.getByRole("log", { name: "Last reply" }).textContent).toBe("");
    expect(screen.queryByText(/Inserted at|Stopped/)).toBeNull();
  });
});
