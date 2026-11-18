// @vitest-environment jsdom
// Saved display information: restore, edit, replacement, gate, Save a copy, print, /check.
import { createDocument } from "@reveal-codes/engine";
import type { IssueKey } from "@reveal-codes/engine";
import type { DisplayInfo } from "@reveal-codes/verifier/link";
import { describe, expect, it, vi } from "vitest";
import { createAutosave } from "../src/autosave";
import { CheckPage } from "../src/check/check-page";
import { startAutosave } from "../src/components/use-autosave";
import { PrintView } from "../src/components/print-view";
import { createDraftGate } from "../src/draft-gate";
import { AUTOSAVE_KEY, deserialise, serialise } from "../src/persist";
import { createResolvedHolder } from "../src/resolved-holder";
import { SAVED_DRAFT_FILE, saveDraftCopy } from "../src/saved-draft";
import type { AppServices } from "../src/services";
import { createStore } from "../src/store-runtime";
import { keysOf } from "./support/case-match-region";
import { createManualTimers } from "./support/clock";
import { createMemoryStorage } from "./support/memory-storage";
import { EXPORT_NOW, EXPORT_VERIFIED_AT } from "./support/export-fixtures";
import { ISO } from "./support/persist-fixtures";
import { act, fireEvent, renderUi, screen, waitFor, within } from "./support/render";
import {
  CITED,
  IQBAL,
  ROE,
  UNREADABLE,
  citedDocument,
  editorOf,
  infoFor,
  listed,
  mountShell,
  section,
  shellServices,
  seeded,
  stored,
  storedResolved,
  verify,
  wait300,
} from "./support/resolved-restore";

describe("verify, reload _Requirements: 25.3, 25.4, 25.11_", () => {
  it("shows the same rows and addresses after a reload, with no Verify_Run", async () => {
    const storage = seeded();
    const first = await mountShell(storage);
    await verify();
    await wait300(first);
    const before = listed();
    expect(before.text.length).toBeGreaterThan(0);
    expect(Array.isArray(storedResolved(storage))).toBe(true);
    first.view.unmount();
    const second = await mountShell(storage);
    expect(listed()).toEqual(before);
    expect(second.mode.routes.requests.filter((r) => r.url === "/api/verify")).toHaveLength(0);
  });
  it("drops a row and its stored entry when a citation is edited", async () => {
    const storage = seeded();
    const first = await mountShell(storage);
    await verify();
    await wait300(first);
    const count = listed().text.length;
    const entries = (storedResolved(storage) as unknown[]).length;
    const ed = editorOf();
    let at = -1;
    ed.state.doc.descendants((node, pos) => {
      const i = node.isTextblock ? node.textContent.indexOf("404 U.S. 519") : -1;
      if (at < 0 && i >= 0) at = pos + 1 + i + 1;
    });
    expect(at).toBeGreaterThan(0);
    await act(async () => {
      ed.view.dispatch(ed.state.tr.insertText("9", at));
      await Promise.resolve();
    });
    await wait300(first);
    expect(listed().text.length).toBe(count - 1);
    const after = storedResolved(storage);
    expect(Array.isArray(after) ? after.length : 0).toBe(entries - 1);
  });
});

describe("replacement clears the entries _Requirements: 25.6, 25.12_", () => {
  // New, Open, a sample and a Hand_Over all install their Document with the `replace` action.
  it("a replace action drops every restored entry and the next write has none", () => {
    const doc = citedDocument();
    const storage = createMemoryStorage();
    storage.setItem(AUTOSAVE_KEY, serialise(doc, [], null, null, infoFor(doc)));
    const timers = createManualTimers();
    const holder = createResolvedHolder();
    const services = {
      storage,
      setTimer: (fn: () => void, ms: number) => timers.setTimeout(fn, ms),
      clearTimer: (h: unknown) => {
        timers.clearTimeout(h as number);
      },
    } as unknown as AppServices;
    const store = createStore(() => EXPORT_NOW);
    const autosave = createAutosave({
      storage,
      setTimer: services.setTimer,
      clearTimer: services.clearTimer,
      onError: () => undefined,
    });
    const stop = startAutosave(services, store, autosave, undefined, holder);
    expect(holder.get()?.info.size).toBe(2);
    const next = createDocument("A different filing.", ISO);
    if (!next.ok) throw new Error("rejected");
    store.dispatch({ type: "replace", document: next.value });
    expect(holder.get()).toBeNull();
    timers.advance(300);
    expect(storedResolved(storage)).toBeUndefined();
    stop();
  });
});

describe("New and a sample in the shell _Requirements: 25.6, 25.12_", () => {
  async function confirm(label: string): Promise<void> {
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: label }));
      await Promise.resolve();
    });
  }
  it("New, then Load demo motion, show no Resolved_List and store no entry", async () => {
    const storage = seeded();
    const m = await mountShell(storage);
    await verify();
    await wait300(m);
    expect(Array.isArray(storedResolved(storage))).toBe(true);
    await act(async () => {
      fireEvent.click(within(screen.getByRole("toolbar")).getByRole("button", { name: "New" }));
      await Promise.resolve();
    });
    await confirm("Discard and start new");
    expect(section()).toBeNull();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Load demo motion" }));
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(screen.getByRole("textbox", { name: "Document" }).textContent.length).toBeGreaterThan(
        0,
      );
    });
    await wait300(m);
    expect(section()).toBeNull();
    expect(storedResolved(storage)).toBeUndefined();
  });
});

describe("a stored draft without usable entries _Requirements: 25.8, 25.9, 25.10, 25.13_", () => {
  it("loads with no Resolved_List when the field is absent", async () => {
    const doc = citedDocument();
    const storage = createMemoryStorage();
    storage.setItem(AUTOSAVE_KEY, serialise(doc, [], EXPORT_VERIFIED_AT, null));
    await mountShell(storage);
    expect(screen.queryByText(UNREADABLE)).toBeNull();
    expect(section()).toBeNull();
  });
  it("ignores a non-array field, keeps the Draft_Gate open and still writes", async () => {
    const doc = citedDocument();
    const base = JSON.parse(serialise(doc, [], EXPORT_VERIFIED_AT, null)) as object;
    const storage = createMemoryStorage();
    storage.setItem(AUTOSAVE_KEY, JSON.stringify({ ...base, resolved: "nope" }));
    const m = await mountShell(storage);
    expect(screen.queryByText(UNREADABLE)).toBeNull();
    expect(section()).toBeNull();
    const ed = editorOf();
    await act(async () => {
      ed.view.dispatch(ed.state.tr.insertText("Typed. ", 1));
      await Promise.resolve();
    });
    await wait300(m);
    expect(stored(storage)).toContain("Typed. ");
  });
  it("keeps the good entries when one is bad, and ignores a stale clusterId at use", () => {
    const doc = citedDocument();
    const [a, b] = keysOf(doc);
    const base = JSON.parse(serialise(doc, [], null, null)) as object;
    const raw = JSON.stringify({
      ...base,
      resolved: [{ key: a, ...ROE, clusterId: "1" }, { key: b }, { key: b, ...IQBAL }],
    });
    const back = deserialise(raw);
    if (!back.ok) throw new Error(back.error.kind);
    expect(back.value.resolved.size).toBe(2);
    const holder = createResolvedHolder();
    const storage = createMemoryStorage();
    storage.setItem(AUTOSAVE_KEY, raw);
    const store = createStore(() => EXPORT_NOW);
    const stop = startAutosave(
      { storage } as unknown as AppServices,
      store,
      createAutosave({
        storage,
        setTimer: () => 0,
        clearTimer: () => undefined,
        onError: () => undefined,
      }),
      undefined,
      holder,
    );
    expect([...(holder.get()?.info.keys() ?? [])]).toEqual([b]);
    stop();
  });
});

describe("the Draft_Gate and the debounce _Requirements: 25.14, 25.17_", () => {
  it("writes nothing while the gate is blocked", () => {
    const doc = citedDocument();
    const storage = createMemoryStorage();
    const timers = createManualTimers();
    const gate = createDraftGate();
    gate.block();
    const autosave = createAutosave({
      storage,
      gate,
      setTimer: (fn, ms) => timers.setTimeout(fn, ms),
      clearTimer: (h) => {
        timers.clearTimeout(h as number);
      },
      onError: () => undefined,
    });
    autosave.schedule(doc, [], null, null, infoFor(doc));
    timers.advance(1000);
    autosave.flush();
    expect(storage.writes()).toBe(0);
  });
  it("a completed run writes only after the 300 ms debounce", async () => {
    const storage = seeded();
    const m = await mountShell(storage);
    await verify();
    const writes = storage.writes();
    expect(storedResolved(storage)).toBeUndefined();
    await act(async () => {
      m.timers.advance(299);
      await Promise.resolve();
    });
    expect(storage.writes()).toBe(writes);
    await wait300(m);
    expect(storage.writes()).toBe(writes + 1);
    expect(Array.isArray(storedResolved(storage))).toBe(true);
  });
});

describe("what the stored entries do not change _Requirements: 25.16, 25.18, 25.20_", () => {
  it("Save a copy downloads exactly the stored string, which includes the field", () => {
    const doc = citedDocument();
    const raw = serialise(doc, [], null, null, infoFor(doc));
    const storage = createMemoryStorage();
    storage.setItem(AUTOSAVE_KEY, raw);
    const download = vi.fn<AppServices["download"]>();
    expect(saveDraftCopy({ storage, download })).toBe(true);
    const [bytes, name] = download.mock.calls[0] ?? [];
    expect(new TextDecoder().decode(bytes)).toBe(raw);
    expect(name).toBe(SAVED_DRAFT_FILE);
    expect(raw).toContain('"resolved":[');
  });
  it("the print view shows the same page with and without the field", () => {
    const doc = citedDocument();
    const text = (info: ReadonlyMap<IssueKey, DisplayInfo> | null): string => {
      const storage = createMemoryStorage();
      storage.setItem(AUTOSAVE_KEY, serialise(doc, [], EXPORT_VERIFIED_AT, null, info));
      const { container, unmount } = renderUi(
        <PrintView services={{ now: () => EXPORT_NOW, storage }} />,
      );
      const out = container.textContent;
      unmount();
      return out;
    };
    const plain = text(null);
    expect(plain.length).toBeGreaterThan(0);
    expect(text(infoFor(doc))).toBe(plain);
    expect(plain).not.toContain("Roe v. Wade (1973)");
  });
  it("the /check page writes nothing to storage", async () => {
    const storage = createMemoryStorage();
    const session = createMemoryStorage();
    const svc: AppServices = { ...shellServices(storage).services, session };
    await act(async () => {
      renderUi(<CheckPage services={svc} styles={{}} />);
      await Promise.resolve();
    });
    fireEvent.change(screen.getByRole("textbox"), { target: { value: CITED } });
    fireEvent.click(screen.getByRole("button", { name: "Check citations" }));
    await waitFor(() => {
      expect(screen.queryByText("Verifying…")).toBeNull();
    });
    expect(screen.getAllByRole("listitem").length).toBeGreaterThan(0);
    expect(storage.writes()).toBe(0);
    expect(session.writes()).toBe(0);
  });
});
