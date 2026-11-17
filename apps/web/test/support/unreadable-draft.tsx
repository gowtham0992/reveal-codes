import { createDocument, render } from "@reveal-codes/engine";
import type { Editor } from "@tiptap/core";
import { vi } from "vitest";
import { AppShell } from "../../src/components/app-shell";
import { AUTOSAVE_KEY } from "../../src/persist";
import type { AppServices } from "../../src/services";
import { createManualTimers } from "./clock";
import { createMemoryStorage } from "./memory-storage";
import { modeApi } from "./mode-fetch";
import { act, fireEvent, renderUi, screen, within } from "./render";
import { createFakeViewport } from "./viewport";
import { fakeBrowserServices } from "./browser-services";

const ISO = "2026-11-02T12:00:00.000Z";
export const AUTOSAVE_FAILED = "Autosave failed. Your draft is kept in this tab only.";

/** A draft saved before the pincite change (see autosave-old-pincite.test.ts): bad_codes. */
export function oldDraft(): string {
  const doc = createDocument("See 174 F.3d 366, 371-72 (2d Cir. 1999).", ISO);
  if (!doc.ok) throw new Error("createDocument failed");
  const full = render(doc.value, "full").text.replace(
    "174 F.3d 366, 371-72 (2d Cir. 1999)[/CIT]",
    "174 F.3d 366, 371[/CIT]-72 (2d Cir. 1999)",
  );
  return JSON.stringify({ version: 1, codes: full, runLog: [], verifiedAt: null });
}

export const KINDS = [
  { kind: "not_json", raw: "this is {not json" },
  { kind: "bad_shape", raw: JSON.stringify({ version: 2, codes: "x" }) },
  { kind: "bad_codes", raw: oldDraft() },
] as const;

export type Options = Readonly<{
  raw?: string | null;
  width?: number;
  throwOnRead?: boolean;
  throwOnRemove?: boolean;
  download?: AppServices["download"];
}>;

function trackedStorage(o: Options) {
  const inner = createMemoryStorage();
  if (o.raw !== undefined && o.raw !== null) inner.setItem(AUTOSAVE_KEY, o.raw);
  const state = { hideReads: false, autosaveReads: 0, keyWrites: 0 };
  const storage = {
    ...inner,
    getItem: (k: string): string | null => {
      if (k === AUTOSAVE_KEY) {
        state.autosaveReads += 1;
        if (o.throwOnRead === true) throw new Error("SecurityError");
        if (state.hideReads) return null;
      }
      return inner.getItem(k);
    },
    setItem: (k: string, v: string): void => {
      if (k === AUTOSAVE_KEY) state.keyWrites += 1;
      inner.setItem(k, v);
    },
    removeItem: (k: string): void => {
      if (o.throwOnRemove === true) throw new Error("SecurityError");
      inner.removeItem(k);
    },
  };
  return { inner, state, storage };
}

export async function mount(o: Options = {}) {
  const timers = createManualTimers();
  const { inner, state, storage } = trackedStorage(o);
  const mode = modeApi("fixtures");
  const openPrint = vi.fn(() => true);
  const services: AppServices = {
    api: {
      ...mode.api,
      demoMotion: () => Promise.resolve({ ok: true as const, value: "Demo sample text." }),
    },
    now: timers.clock.now,
    setTimer: (fn, ms) => timers.setTimeout(fn, ms),
    clearTimer: (h) => {
      timers.clearTimeout(h as number);
    },
    storage,
    download: o.download ?? (() => undefined),
    openPrint,
    viewport: createFakeViewport(o.width ?? 1280),
    ...fakeBrowserServices(),
  };
  await act(async () => {
    renderUi(<AppShell services={services} />);
    await Promise.resolve();
  });
  return { storage, inner, timers, state, openPrint };
}
export type Mounted = Awaited<ReturnType<typeof mount>>;

export const aside = (): HTMLElement => screen.getByRole("complementary", { name: /^Issues/ });
export const toolbar = (): HTMLElement => screen.getByRole("toolbar");
export const toolbarNotice = (): string => within(toolbar()).getByRole("status").textContent;
export const draftButton = (name: string): HTMLElement =>
  within(aside()).getByRole("button", { name, hidden: false });

export async function click(el: HTMLElement): Promise<void> {
  await act(async () => {
    fireEvent.click(el);
    await Promise.resolve();
  });
}

export async function type(text: string): Promise<void> {
  const el: HTMLElement & { editor?: Editor } = screen.getByRole("textbox", { name: "Document" });
  const ed = el.editor;
  if (ed === undefined) throw new Error("no editor on the textbox");
  await act(async () => {
    ed.view.dispatch(ed.state.tr.insertText(text, 1));
    await Promise.resolve();
  });
}

export async function wait300(m: Mounted): Promise<void> {
  await act(async () => {
    m.timers.advance(300);
    await Promise.resolve();
  });
}
