import type { Viewport } from "../../src/services";

export type FakeViewport = Viewport & Readonly<{ setWidth: (width: number) => void }>;

/** A Viewport whose width is settable; setting it notifies every subscriber. */
export function createFakeViewport(initialWidth = 1280): FakeViewport {
  let current = initialWidth;
  const listeners = new Set<() => void>();
  return {
    width: () => current,
    subscribe: (onChange) => {
      listeners.add(onChange);
      return () => {
        listeners.delete(onChange);
      };
    },
    setWidth: (width) => {
      current = width;
      for (const listener of [...listeners]) listener();
    },
  };
}
