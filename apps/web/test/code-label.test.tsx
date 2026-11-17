// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { CodeLabel, type CodeLabelCode } from "../src/pane/code-label";
import { renderUi } from "./support/render";

const PASSING: readonly CodeLabelCode[] = ["CIT ✓", "CIT …", "QUO ✓", "QUO …"];
const FAILING: readonly CodeLabelCode[] = ["CIT ✘", "CIT ≠", "CIT ?", "QUO ✘"];

function labelFor(code: CodeLabelCode): HTMLElement {
  const { container } = renderUi(<CodeLabel code={code} />);
  const el = container.firstElementChild;
  if (!(el instanceof HTMLElement)) throw new Error("CodeLabel rendered no element");
  return el;
}

describe("CodeLabel _Requirements: 6.5, 6.13_", () => {
  it.each([...PASSING, ...FAILING])("renders %s with its characters unchanged", (code) => {
    const el = labelFor(code);
    expect(el.tagName).toBe("SPAN");
    expect(el.textContent).toBe(code);
  });

  it.each(FAILING)("gives %s the failing class", (code) => {
    const el = labelFor(code);
    expect(el.className).toMatch(/failing/);
    expect(el.className).toMatch(/fail(?!ing)/);
  });

  it.each(PASSING)("gives %s no failing class", (code) => {
    expect(labelFor(code).className).not.toMatch(/fail/);
  });
});
