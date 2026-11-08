import { cleanup, render, type RenderResult } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach } from "vitest";
import "./dom-shims";

afterEach(() => {
  cleanup();
});

/** Renders into a fresh container; `afterEach(cleanup)` unmounts it. */
export function renderUi(ui: ReactElement): RenderResult {
  return render(ui);
}

export { screen, within, fireEvent, act, waitFor } from "@testing-library/react";
