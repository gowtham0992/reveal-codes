import type { AppServices } from "../../src/services";
import { createMemoryStorage } from "./memory-storage";

export type FakeClipboard = AppServices["clipboard"] & {
  /** Every text written so far. */
  readonly written: readonly string[];
};

/** A clipboard that records writes. `available: false` models a browser with none; `reject` makes `write` fail. */
export function createFakeClipboard(
  options: { available?: boolean; reject?: boolean } = {},
): FakeClipboard {
  const written: string[] = [];
  return {
    written,
    available: () => options.available ?? true,
    write: (text) => {
      if (options.reject === true) return Promise.reject(new Error("clipboard denied"));
      written.push(text);
      return Promise.resolve();
    },
  };
}

/** The `session` and `clipboard` fields of `AppServices`, for tests that build complete fakes. */
export function fakeBrowserServices(): Pick<AppServices, "session" | "clipboard"> {
  return { session: createMemoryStorage(), clipboard: createFakeClipboard() };
}
