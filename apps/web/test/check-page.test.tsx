// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToString } from "react-dom/server";
import { docxSafe } from "@reveal-codes/export";
import { describe, expect, it } from "vitest";
import { createApiClient } from "../src/client/api";
import type { FetchFn } from "../src/client/api";
import { openFile } from "../src/client/open-file";
import { FAILED_NOTICE } from "../src/client/verify-summary";
import { CheckPage } from "../src/check/check-page";
import { COPY_FAILED, EARLIER_LABEL, STALE_SENTENCE } from "../src/check/check-text";
import { BLANK_TEXT_SENTENCE, NO_CITATIONS_SENTENCE } from "../src/check/run-check";
import { DEMO_MODE_LINE } from "../src/components/issues-region";
import { AVIANCA_FAILED } from "../src/components/use-document-actions";
import { WAITING_AFTER_MS, WAITING_TEXT } from "../src/components/use-verify";
import { MAX_TEXT_CHARS } from "../src/limits";
import { CHECKS_BUSY, DOCUMENT_TOO_LONG } from "../src/notices";
import { handleMode } from "../src/server/mode-route";
import { readServerConfig } from "../src/server/deps";
import type { AppServices } from "../src/services";
import { createManualTimers } from "./support/clock";
import { createFakeClipboard } from "./support/browser-services";
import type { FakeClipboard } from "./support/browser-services";
import { createMemoryStorage } from "./support/memory-storage";
import { act, fireEvent, renderUi, screen, waitFor, within } from "./support/render";
import { routeFetch } from "./support/route-fetch";
import { createFakeViewport } from "./support/viewport";
import { passwordStandIn, simpleDocx } from "./support/word-fixtures";

const SAMPLE = readFileSync(
  resolve(__dirname, "../../../packages/engine/fixtures/avianca-citations.txt"),
  "utf8",
);
const DEMO = readFileSync(
  resolve(__dirname, "../../../packages/engine/fixtures/demo-motion.txt"),
  "utf8",
);
const demoMotionText = (): string => DEMO;
const CHAMBERS = "Chambers v. NASCO, Inc., 501 U.S. 32 (1991)";

type Mode = "fixtures" | "live";
type Options = Readonly<{
  mode?: Mode;
  sample?: "ok" | "fail";
  verifyStatus?: number;
  clipboard?: FakeClipboard;
}>;
type Sent = Readonly<{ url: string; method: string; body: string | null }>;

function serverFetch(options: Options) {
  const routes = routeFetch();
  const sent: Sent[] = [];
  const gate: { current: Promise<void> | null } = { current: null };
  const fetchFn: FetchFn = async (url, init) => {
    sent.push({ url, method: init?.method ?? "GET", body: init?.body ?? null });
    if (url === "/api/mode") {
      const env =
        options.mode === "live"
          ? { COURTLISTENER_TOKEN: "test-token-not-real" }
          : { REVEAL_CODES_FIXTURES_ONLY: "1" };
      return handleMode(readServerConfig(env));
    }
    if (url === "/avianca-citations.txt") {
      return options.sample === "fail" ? new Response("no", { status: 500 }) : new Response(SAMPLE);
    }
    if (url === "/api/verify") {
      if (gate.current !== null) await gate.current;
      if (options.verifyStatus !== undefined) {
        return new Response(JSON.stringify({ error: "x" }), { status: options.verifyStatus });
      }
    }
    return routes.fetch(url, init);
  };
  return { fetchFn, sent, gate };
}

function services(options: Options) {
  const server = serverFetch(options);
  const timers = createManualTimers();
  const clipboard = options.clipboard ?? createFakeClipboard();
  const svc: AppServices = {
    api: createApiClient(server.fetchFn),
    now: timers.clock.now,
    setTimer: (fn, ms) => timers.setTimeout(fn, ms),
    clearTimer: (h) => {
      timers.clearTimeout(h as number);
    },
    storage: createMemoryStorage(),
    download: () => undefined,
    openPrint: () => true,
    viewport: createFakeViewport(),
    session: createMemoryStorage(),
    clipboard,
  };
  return { svc, server, timers, clipboard };
}

async function mount(options: Options = {}) {
  const made = services(options);
  await act(async () => {
    renderUi(<CheckPage services={made.svc} styles={{}} />);
    await Promise.resolve();
  });
  return made;
}

const box = (): HTMLTextAreaElement => screen.getByRole<HTMLTextAreaElement>("textbox");
const status = (): HTMLElement => screen.getByRole("status");
const type = (text: string): void => {
  fireEvent.change(box(), { target: { value: text } });
};
const press = (name: string): void => {
  fireEvent.click(screen.getByRole("button", { name }));
};
async function check(): Promise<void> {
  press("Check citations");
  await waitFor(() => {
    expect(screen.queryByText("Verifying…")).toBeNull();
  });
}
const apiRequests = (sent: readonly Sent[]): Sent[] => sent.filter((s) => s.url !== "/api/mode");
const items = (): HTMLElement[] => within(status()).queryAllByRole("listitem");
const countWith = (code: string): number =>
  items().filter((li) => li.textContent.startsWith(code)).length;

type FileLike = Readonly<{ name: string; size: number; arrayBuffer: () => Promise<ArrayBuffer> }>;
function fileLike(name: string, bytes: Uint8Array, size = bytes.length): FileLike {
  const copy = bytes.slice().buffer;
  return { name, size, arrayBuffer: () => Promise.resolve(copy) };
}
async function pick(file: FileLike): Promise<void> {
  const input = screen.getByLabelText("Open a draft file");
  Object.defineProperty(input, "files", { value: [file], configurable: true });
  await act(async () => {
    fireEvent.change(input);
    await new Promise((r) => setTimeout(r, 0));
  });
}
const utf8 = (s: string): Uint8Array => new TextEncoder().encode(s);

describe("check page: getting text in _Requirements: 17.1, 3.1, 3.11_", () => {
  it("holds typed and pasted text and sends nothing", async () => {
    const { server } = await mount();
    type("first");
    expect(box().value).toBe("first");
    fireEvent.paste(box(), { clipboardData: { getData: () => "second" } });
    type("second\nCitation, 1 U.S. 1 (1800)");
    expect(box().value).toBe("second\nCitation, 1 U.S. 1 (1800)");
    expect(apiRequests(server.sent)).toEqual([]);
  });

  it.each([
    ["notes.txt", utf8(`Plain text.\n${CHAMBERS}`)],
    ["notes.md", utf8(`# Heading\n${CHAMBERS}`)],
    ["brief.docx", simpleDocx(["Word paragraph.", CHAMBERS])],
  ] as const)("opens %s into the box with the page's own sentence", async (name, bytes) => {
    const { server } = await mount();
    await pick(fileLike(name, bytes));
    expect(box().value).toContain(CHAMBERS);
    expect(status().textContent).toContain(`Opened ${name}: `);
    expect(status().textContent).not.toContain("marked as pasted");
    expect(apiRequests(server.sent)).toEqual([]);
  });

  it.each([
    ["a kind it cannot read", fileLike("scan.pdf", utf8("x"))],
    ["a file over 5 MB", fileLike("big.txt", utf8("x"), 5_242_881)],
    ["text that is not UTF-8", fileLike("bad.txt", Uint8Array.of(0xff, 0xfe, 0xfd, 0x80))],
    ["a damaged Word file", fileLike("bad.docx", utf8("not a zip"))],
    ["a password-protected Word file", fileLike("locked.docx", passwordStandIn())],
  ] as const)("shows the refusal for %s unchanged and keeps the draft", async (_label, file) => {
    await mount();
    type("keep me");
    const outcome = await openFile(file);
    if (outcome.kind !== "refused") throw new Error("expected a refusal");
    await pick(file);
    expect(status().textContent).toContain(outcome.notice);
    expect(status().textContent).toContain(outcome.note);
    expect(box().value).toBe("keep me");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("loads the Avianca citations into an empty box", async () => {
    await mount();
    await act(async () => {
      press("Load the Avianca citations");
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(box().value).toBe(docxSafe(SAMPLE).text);
    });
  });

  it("shows AVIANCA_FAILED and keeps the draft when the sample cannot be fetched", async () => {
    await mount({ sample: "fail" });
    type("keep me");
    await act(async () => {
      press("Load the Avianca citations");
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(status().textContent).toContain(AVIANCA_FAILED);
    });
    expect(box().value).toBe("keep me");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("clears the box and the results without asking", async () => {
    await mount();
    type(demoMotionText());
    await check();
    expect(items().length).toBeGreaterThan(0);
    press("Clear");
    expect(box().value).toBe("");
    expect(items()).toEqual([]);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("asks before the sample replaces text, and keeps the draft on cancel", async () => {
    await mount();
    type("my draft");
    await act(async () => {
      press("Load the Avianca citations");
      await new Promise((r) => setTimeout(r, 0));
    });
    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByText("Replace the current draft with the Avianca citations?"),
    ).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(box().value).toBe("my draft");
    await act(async () => {
      press("Load the Avianca citations");
      await new Promise((r) => setTimeout(r, 0));
    });
    fireEvent.click(
      within(await screen.findByRole("dialog")).getByRole("button", { name: "Replace draft" }),
    );
    expect(box().value).toBe(docxSafe(SAMPLE).text);
  });

  it("asks before a file replaces text, and only after the reader accepts it", async () => {
    await mount();
    type("my draft");
    await pick(fileLike("scan.pdf", utf8("x")));
    expect(screen.queryByRole("dialog")).toBeNull();
    await pick(fileLike("notes.txt", utf8(CHAMBERS)));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Discard the current draft and open notes.txt?")).toBeTruthy();
    expect(box().value).toBe("my draft");
    fireEvent.click(within(dialog).getByRole("button", { name: "Discard and open" }));
    expect(box().value).toBe(CHAMBERS);
  });
});

describe("check page: running a check _Requirements: 17.2, 17.3_", () => {
  it("checks the Avianca sample: two found, two wrong case, two not found, with case names", async () => {
    await mount();
    await act(async () => {
      press("Load the Avianca citations");
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(box().value).not.toBe("");
    });
    await check();
    expect(items()).toHaveLength(6);
    expect(countWith("CIT ✓")).toBe(2);
    expect(countWith("CIT ≠")).toBe(2);
    expect(countWith("CIT ✘")).toBe(2);
    for (const li of items().filter((i) => /^CIT [✓≠]/u.test(i.textContent))) {
      expect(li.textContent).toMatch(/ v\. /u);
      expect(within(li).getByRole("link", { name: /CourtListener/u })).toBeTruthy();
    }
    for (const li of items().filter((i) => i.textContent.startsWith("CIT ✘"))) {
      expect(within(li).queryByRole("link")).toBeNull();
    }
    expect(status().textContent).toContain("Citations: ");
  });

  it("lists a quotation that is not in the opinion with where it diverges", async () => {
    await mount();
    type(demoMotionText());
    await check();
    expect(countWith("QUO ✘")).toBeGreaterThan(0);
    const quo = items().find((i) => i.textContent.startsWith("QUO ✘"));
    expect(quo?.textContent).toContain("Diverges at: ");
  });

  it("shows CHECKS_BUSY on 429 and FAILED_NOTICE on another failure, keeping the draft", async () => {
    await mount({ verifyStatus: 429 });
    type(demoMotionText());
    await check();
    expect(status().textContent).toContain(CHECKS_BUSY);
    expect(box().value).toBe(demoMotionText());
  });

  it("shows FAILED_NOTICE when the run fails for another reason", async () => {
    await mount({ verifyStatus: 500 });
    type(demoMotionText());
    await check();
    expect(status().textContent).toContain(FAILED_NOTICE);
    expect(box().value).toBe(demoMotionText());
  });

  it("shows the demo-mode line when the server runs on fixtures, and not when live", async () => {
    await mount({ mode: "fixtures" });
    await waitFor(() => {
      expect(status().textContent).toContain(DEMO_MODE_LINE);
    });
  });

  it("does not show the demo-mode line when live", async () => {
    const { server } = await mount({ mode: "live" });
    await waitFor(() => {
      expect(server.sent.some((s) => s.url === "/api/mode")).toBe(true);
    });
    expect(status().textContent).not.toContain(DEMO_MODE_LINE);
  });

  it("disables the button while verifying, shows the waiting text at 5000 ms, then clears it", async () => {
    const { server, timers } = await mount();
    let release: () => void = () => undefined;
    server.gate.current = new Promise<void>((r) => {
      release = r;
    });
    type(demoMotionText());
    await act(async () => {
      press("Check citations");
      await Promise.resolve();
    });
    const button = screen.getByRole<HTMLButtonElement>("button", { name: "Check citations" });
    expect(button.disabled).toBe(true);
    expect(status().textContent).toContain("Verifying…");
    expect(status().textContent).not.toContain(WAITING_TEXT);
    act(() => {
      timers.advance(WAITING_AFTER_MS - 1);
    });
    expect(status().textContent).not.toContain(WAITING_TEXT);
    act(() => {
      timers.advance(1);
    });
    expect(status().textContent).toContain(WAITING_TEXT);
    release();
    await waitFor(() => {
      expect(items().length).toBeGreaterThan(0);
    });
    expect(status().textContent).not.toContain(WAITING_TEXT);
    expect(status().textContent).not.toContain("Verifying…");
    expect(button.disabled).toBe(false);
    expect(timers.pending()).toBe(0);
  });

  it.each([
    ["too long", "a".repeat(MAX_TEXT_CHARS + 1), DOCUMENT_TOO_LONG],
    ["blank", "  \n\t ", BLANK_TEXT_SENTENCE],
    ["without a citation", "The court denied the motion.", NO_CITATIONS_SENTENCE],
  ] as const)("refuses a draft that is %s with no request", async (_label, text, sentence) => {
    const { server } = await mount();
    type(text);
    await check();
    expect(status().textContent).toContain(sentence);
    expect(apiRequests(server.sent)).toEqual([]);
  });
});

describe("check page: results go out of date _Requirements: 9.1, 9.4, 9.5_", () => {
  it("marks results out of date on edit, even when the text is restored, until a new run", async () => {
    const { server } = await mount();
    type(demoMotionText());
    await check();
    expect(status().textContent).not.toContain(STALE_SENTENCE);
    type(`${demoMotionText()} more`);
    expect(status().textContent).toContain(STALE_SENTENCE);
    expect(status().textContent).toContain(EARLIER_LABEL);
    expect(screen.queryByRole("button", { name: "Copy results" })).toBeNull();
    type(demoMotionText());
    expect(status().textContent).toContain(STALE_SENTENCE);
    const before = server.sent.filter((s) => s.url === "/api/verify").length;
    press("Check again");
    await waitFor(() => {
      expect(screen.queryByText("Verifying…")).toBeNull();
    });
    expect(server.sent.filter((s) => s.url === "/api/verify").length).toBe(before + 1);
    expect(status().textContent).not.toContain(STALE_SENTENCE);
    expect(screen.getByRole("button", { name: "Copy results" })).toBeTruthy();
  });

  it("drops the results of a run whose text was edited while it ran", async () => {
    const { server } = await mount();
    let release: () => void = () => undefined;
    server.gate.current = new Promise<void>((r) => {
      release = r;
    });
    type(demoMotionText());
    await act(async () => {
      press("Check citations");
      await Promise.resolve();
    });
    expect(box().disabled).toBe(false);
    type(`${demoMotionText()} edited`);
    release();
    await waitFor(() => {
      expect(screen.queryByText("Verifying…")).toBeNull();
    });
    expect(items()).toEqual([]);
    expect(status().textContent).not.toContain("Citations: ");
    expect(status().textContent).not.toContain(STALE_SENTENCE);
    expect(
      screen.getByRole<HTMLButtonElement>("button", { name: "Check citations" }).disabled,
    ).toBe(false);
  });
});

describe("check page: Copy results _Requirements: 10.1, 10.2, 10.3, 10.8, 10.9_", () => {
  it("writes the plain-text results, with no further request", async () => {
    const clipboard = createFakeClipboard();
    const { server } = await mount({ clipboard });
    type(demoMotionText());
    await check();
    const before = server.sent.length;
    await act(async () => {
      press("Copy results");
      await Promise.resolve();
    });
    expect(clipboard.written).toHaveLength(1);
    const lines = (clipboard.written[0] ?? "").split("\n");
    expect(lines[0]).toMatch(/^Citations: /u);
    expect(lines[lines.length - 1]).toMatch(/^Checked on \d{4}-\d{2}-\d{2} with Reveal Codes/u);
    expect(lines).toHaveLength(items().length + 2);
    expect(clipboard.written[0]).not.toContain("|");
    expect(server.sent).toHaveLength(before);
  });

  it("shows the failure sentence when the write is refused", async () => {
    await mount({ clipboard: createFakeClipboard({ reject: true }) });
    type(demoMotionText());
    await check();
    await act(async () => {
      press("Copy results");
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(status().textContent).toContain(COPY_FAILED);
    });
  });

  it("renders no button without a clipboard", async () => {
    await mount({ clipboard: createFakeClipboard({ available: false }) });
    type(demoMotionText());
    await check();
    expect(items().length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: "Copy results" })).toBeNull();
  });

  it("puts neither Copy results nor the editor link in the server HTML", () => {
    const { svc } = services({});
    const html = renderToString(<CheckPage services={svc} styles={{}} />);
    expect(html).toContain("Your draft");
    expect(html).toContain("Check citations");
    expect(html).not.toContain("Copy results");
    expect(html).not.toContain("Open this draft in the editor");
  });
});
