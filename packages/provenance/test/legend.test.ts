import { describe, expect, it } from "vitest";
import {
  humNotice,
  legendLines,
  LEGEND_ITEMS,
  noPromptSessionsLine,
  staleLine,
} from "../src/core/legend.js";
describe("Source_Legend (Req 9.3)", () => {
  it("has the four items of the requirement, in order, word for word", () => {
    expect(LEGEND_ITEMS.map((i) => [i.code, i.words])).toEqual([
      ["[AI:<tag>]", "changed while the agent was working, with the run it belongs to"],
      [
        "[AI>HUM:<tag>]",
        "agent text in a run that the Engine counts as edited while no agent window was open",
      ],
      [
        "[HUM]",
        "changed while no agent window was open; typing, pasting and other tools are not told apart",
      ],
      ["[PST]", "already in the file when recording started; origin not recorded"],
    ]);
    expect(legendLines()).toHaveLength(4);
    expect(legendLines()[3]).toBe(
      "[PST] already in the file when recording started; origin not recorded",
    );
  });
  it("reads <run> in the first two items for --full and keeps every word", () => {
    const full = legendLines("run");
    expect(full[0]).toBe(
      "[AI:<run>] changed while the agent was working, with the run it belongs to",
    );
    expect(full[1]?.startsWith("[AI>HUM:<run>] agent text in a run")).toBe(true);
    expect(full.slice(2)).toEqual(legendLines().slice(2));
  });
  it("uses the [HUM] item as the notice", () => {
    expect(humNotice()).toBe(legendLines()[2]);
    expect(humNotice()).toContain("typing, pasting and other tools are not told apart");
  });
  it("words the stale line and the no-prompt-sessions line", () => {
    expect(staleLine("src/a.ts", 12)).toBe(
      "stale: src/a.ts changed after the last recorded event; 12 characters not yet recorded; run: reveal --record",
    );
    expect(noPromptSessionsLine(3)).toBe(
      "Sessions with no prompt events: 3 counted. In such a session an edit the agent made between tasks is recorded as [HUM]. The count can miss sessions or count one twice; see Limits.",
    );
  });
});
