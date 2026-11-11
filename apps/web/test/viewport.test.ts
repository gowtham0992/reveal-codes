import { describe, expect, it, vi } from "vitest";
import { defaultServices, NARROW_WIDTH, SHELL_MIN_WIDTH } from "../src/services";
import { createFakeViewport } from "./support/viewport";

describe("fake Viewport", () => {
  it("defaults to 1280 and reports a width set later", () => {
    const viewport = createFakeViewport();
    expect(viewport.width()).toBe(1280);
    viewport.setWidth(799);
    expect(viewport.width()).toBe(799);
  });

  it("notifies subscribers on a change and stops after unsubscribe", () => {
    const viewport = createFakeViewport(1000);
    const onChange = vi.fn();
    const unsubscribe = viewport.subscribe(onChange);
    viewport.setWidth(900);
    expect(onChange).toHaveBeenCalledTimes(1);
    unsubscribe();
    viewport.setWidth(800);
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});

describe("default Viewport", () => {
  it("has the documented thresholds", () => {
    expect(NARROW_WIDTH).toBe(800);
    expect(SHELL_MIN_WIDTH).toBe(1150);
  });

  it("builds without touching window, then reads it lazily", () => {
    expect(typeof window).toBe("undefined");
    const { viewport } = defaultServices();
    expect(typeof viewport.width).toBe("function");
    expect(typeof viewport.subscribe).toBe("function");
  });
});
