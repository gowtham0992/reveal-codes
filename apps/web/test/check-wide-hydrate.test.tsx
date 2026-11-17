// @vitest-environment jsdom
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import { CheckPage } from "../src/check/check-page";
import { defaultServices } from "../src/services";
import type { AppServices } from "../src/services";
import { modeApi } from "./support/mode-fetch";
import { act, fireEvent, screen } from "./support/render";

const LINK_TEXT = "Open this draft in the editor";
const DRAFT = "See Roe v. Wade, 410 U.S. 113 (1973).";

function setInnerWidth(width: number): void {
  Object.defineProperty(window, "innerWidth", { configurable: true, writable: true, value: width });
}

/** Production viewport and clock, with the network replaced. */
function productionServices(): AppServices {
  return { ...defaultServices(), api: modeApi("fixtures").api };
}

const link = (): HTMLElement | null => screen.queryByRole("link", { name: LINK_TEXT });

let container: HTMLElement | null = null;
afterEach(() => {
  container?.remove();
  container = null;
});

async function hydrateAt(width: number): Promise<void> {
  // The server renders with no window: the narrow default.
  const html = renderToString(<CheckPage services={productionServices()} styles={{}} />);
  setInnerWidth(width);
  container = document.createElement("div");
  container.innerHTML = html;
  document.body.appendChild(container);
  await act(async () => {
    hydrateRoot(
      container as HTMLElement,
      <CheckPage services={productionServices()} styles={{}} />,
    );
    await Promise.resolve();
  });
}

function type(text: string): void {
  act(() => {
    fireEvent.change(screen.getByLabelText("Your draft"), { target: { value: text } });
  });
}

function resizeTo(width: number): void {
  act(() => {
    setInnerWidth(width);
    window.dispatchEvent(new Event("resize"));
  });
}

type Listener = (e: Event) => void;

/** A matchMedia whose "(min-width: 800px)" query follows window.innerWidth and reports changes on demand. */
function installMatchMedia(): () => void {
  const listeners = new Set<Listener>();
  const saved = Object.getOwnPropertyDescriptor(window, "matchMedia");
  window.matchMedia = ((query: string) => ({
    media: query,
    get matches() {
      return window.innerWidth >= 800;
    },
    addEventListener: (_t: string, l: Listener) => listeners.add(l),
    removeEventListener: (_t: string, l: Listener) => listeners.delete(l),
  })) as unknown as typeof window.matchMedia;
  const fire = (): void => {
    for (const l of [...listeners]) l(new Event("change"));
  };
  window.addEventListener("__mq", fire);
  return () => {
    window.removeEventListener("__mq", fire);
    if (saved === undefined) Reflect.deleteProperty(window, "matchMedia");
    else Object.defineProperty(window, "matchMedia", saved);
  };
}

describe("Editor_Link when only the media query reports the change _Requirements: 23.1, 23.5_", () => {
  it("appears when the width crosses 800px and no resize event fires", async () => {
    const uninstall = installMatchMedia();
    try {
      await hydrateAt(375);
      type(DRAFT);
      expect(link()).toBeNull();
      act(() => {
        setInnerWidth(1280);
        window.dispatchEvent(new Event("__mq"));
      });
      expect(link()).not.toBeNull();
    } finally {
      uninstall();
    }
  });
});

describe("Editor_Link after server render and hydration _Requirements: 23.1, 23.2, 23.3, 23.5_", () => {
  it("appears when a page hydrated at 375px is widened to 1280px by a resize event", async () => {
    await hydrateAt(375);
    type(DRAFT);
    expect(link()).toBeNull();
    resizeTo(1280);
    expect(link()).not.toBeNull();
  });

  it("goes again when the page is narrowed", async () => {
    await hydrateAt(1280);
    type(DRAFT);
    expect(link()).not.toBeNull();
    resizeTo(375);
    expect(link()).toBeNull();
  });
});
