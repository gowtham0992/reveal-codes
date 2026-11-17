// _Requirements: 2.2, 3.2, 3.3, 3.4, 16.2, 16.4_
import { describe, expect, it } from "vitest";
import data from "../../../data/standing-orders.json";
import { ORDERS, compareAbbreviations, courtGroups, orderStats } from "../src/index.js";
import type { OrderEntry } from "../src/orders-types.js";

function entry(
  id: string,
  abbreviation: string,
  overrides: Partial<{ judge: boolean; date: string }> = {},
): OrderEntry {
  return {
    id,
    court: { name: `Court ${abbreviation}`, abbreviation, level: "appeals" },
    judge: overrides.judge === true ? { name: "Pat Example", role: "district" } : null,
    instrument: "Standing order",
    title: "",
    date: overrides.date ?? "2024-01-01",
    kind: "guidance",
    applies_to: "all",
    elements: [],
    caption: null,
    key_language: "text",
    source_url: "https://example.gov/order",
    source_kind: "court",
    retrieved: "2025-01-01",
    status: "current",
  };
}

describe("compareAbbreviations (Requirements 2.2, 3.2)", () => {
  it("sorts 5th Cir. before 10th Cir. BAP", () => {
    expect(compareAbbreviations("5th Cir.", "10th Cir. BAP")).toBeLessThan(0);
    expect(compareAbbreviations("10th Cir. BAP", "5th Cir.")).toBeGreaterThan(0);
    expect(compareAbbreviations("5th Cir.", "5th Cir.")).toBe(0);
  });

  it("ignores spaces and full stops: D. Neb., D.N.M., D. Wyo. (Requirement 22)", () => {
    const sorted = ["D. Wyo.", "D.N.M.", "D. Neb."].sort(compareAbbreviations);
    expect(sorted).toEqual(["D. Neb.", "D.N.M.", "D. Wyo."]);
    const stripped = sorted.map((s) => s.replace(/[\s.]/g, ""));
    expect(stripped).toEqual(["DNeb", "DNM", "DWyo"]);
  });

  it("orders court groups D. Neb., D.N.M., D. Wyo.", () => {
    const groups = courtGroups([
      entry("w", "D. Wyo."),
      entry("m", "D.N.M."),
      entry("n", "D. Neb."),
    ]);
    expect(groups.map((g) => g.court.abbreviation)).toEqual(["D. Neb.", "D.N.M.", "D. Wyo."]);
  });
});

describe("courtGroups ordering (Requirements 3.2, 3.3, 3.4, 16.4)", () => {
  it("orders groups with compareAbbreviations, 5th before 10th BAP", () => {
    const groups = courtGroups([
      entry("a", "10th Cir. BAP"),
      entry("b", "5th Cir."),
      entry("c", "D. Mass."),
    ]);
    const abbreviations = groups.map((g) => g.court.abbreviation);
    expect(abbreviations.indexOf("5th Cir.")).toBeLessThan(abbreviations.indexOf("10th Cir. BAP"));
    const expected = [...abbreviations].sort(compareAbbreviations);
    expect(abbreviations).toEqual(expected);
  });

  it("puts Court_Wide before Judge_Level regardless of date or id", () => {
    const groups = courtGroups([
      entry("a-judge", "5th Cir.", { judge: true, date: "2025-06-01" }),
      entry("z-wide", "5th Cir.", { date: "2020-01-01" }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.entries.map((e) => e.id)).toEqual(["z-wide", "a-judge"]);
  });

  it("puts the newest date first inside a rank", () => {
    const groups = courtGroups([
      entry("old", "5th Cir.", { date: "2021-03-01" }),
      entry("new", "5th Cir.", { date: "2024-03-01" }),
      entry("mid", "5th Cir.", { date: "2022-03-01" }),
    ]);
    expect(groups[0]?.entries.map((e) => e.id)).toEqual(["new", "mid", "old"]);
  });

  it("breaks date ties by id ascending", () => {
    const groups = courtGroups([
      entry("b", "5th Cir.", { date: "2024-01-01" }),
      entry("c", "5th Cir.", { date: "2024-01-01" }),
      entry("a", "5th Cir.", { date: "2024-01-01" }),
    ]);
    expect(groups[0]?.entries.map((e) => e.id)).toEqual(["a", "b", "c"]);
  });

  it("does not mutate its input", () => {
    const input = [entry("b", "5th Cir."), entry("a", "5th Cir.")];
    courtGroups(input);
    expect(input.map((e) => e.id)).toEqual(["b", "a"]);
  });

  it("keeps every shipped entry exactly once", () => {
    const ids = courtGroups(ORDERS.entries).flatMap((g) => g.entries.map((e) => e.id));
    expect([...ids].sort()).toEqual(ORDERS.entries.map((e) => e.id).sort());
  });
});

describe("orderStats on the shipped dataset (Requirements 2.2, 16.2)", () => {
  it("equals counts computed independently from the raw file", () => {
    const raw = data as unknown as {
      compiled: string;
      entries: ReadonlyArray<{ court: { abbreviation: string }; status: string }>;
    };
    const courts = new Set<string>();
    let inForce = 0;
    for (const e of raw.entries) {
      courts.add(e.court.abbreviation);
      if (e.status === "current") inForce += 1;
    }
    expect(orderStats(ORDERS)).toEqual({
      total: raw.entries.length,
      courts: courts.size,
      inForce,
      compiled: raw.compiled,
    });
  });

  it("counts a synthetic dataset", () => {
    const superseded: OrderEntry = { ...entry("s", "D. Mass."), status: "superseded" };
    const stats = orderStats({
      ...ORDERS,
      compiled: "2026-01-01",
      entries: [entry("a", "5th Cir."), entry("b", "5th Cir."), superseded],
    });
    expect(stats).toEqual({ total: 3, courts: 2, inForce: 2, compiled: "2026-01-01" });
  });
});
