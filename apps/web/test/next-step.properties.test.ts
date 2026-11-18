import * as fc from "fast-check";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { nextStep } from "../src/components/next-step";
import type { NextStep } from "../src/components/next-step";
import { Toolbar, exportLabel } from "../src/components/toolbar";
import { arbNextStepInput } from "./arbitraries";
import type { NextStepCase } from "./arbitraries";
import { runs } from "./support/fc";

function toolbarHtml(step: NextStep, input: NextStepCase): string {
  return renderToStaticMarkup(
    createElement(Toolbar, {
      step,
      notice: null,
      empty: input.empty,
      paneOpen: false,
      verifyDisabled: false,
      verifyRunning: input.verifying,
      blockingCount: input.blocking,
    }),
  );
}

/** Labels of the buttons that carry data-primary="true". */
function primaryLabels(html: string): string[] {
  return [...html.matchAll(/<button[^>]*data-primary="true"[^>]*>([^<]*)<\/button>/g)].map(
    (m) => m[1] ?? "",
  );
}

/** The ordered rule of Requirement 4, written as a table keyed by its outcome. */
function expectedLabels(input: NextStepCase): string[] {
  const table: Record<"none" | "load-avianca" | "verify" | "export", string[]> = {
    none: [],
    "load-avianca": ["Load Mata v. Avianca"],
    verify: ["Verify"],
    export: [exportLabel(input.blocking)],
  };
  if (input.verifying) return table.none;
  if (input.empty) return table["load-avianca"];
  if (input.uncheckedCitations + input.uncheckedQuotations > 0 || input.needsCheckDate) {
    return table.verify;
  }
  return table.export;
}

describe("Property 1: one next step _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.7, 4.10, 4.12_", () => {
  it("marks at most one button, none while verifying, otherwise the one the rule names", () => {
    // Property 1
    fc.assert(
      fc.property(arbNextStepInput, (input) => {
        const step = nextStep(input);
        const labels = primaryLabels(toolbarHtml(step, input));
        expect(labels.length).toBeLessThanOrEqual(1);
        if (input.verifying) expect(labels).toEqual([]);
        expect(labels).toEqual(expectedLabels(input));
        // Metamorphic: only the blocking count changes, the step does not.
        expect(nextStep({ ...input, blocking: input.blocking + 1 })).toBe(step);
      }),
      { numRuns: runs() },
    );
  });
});
