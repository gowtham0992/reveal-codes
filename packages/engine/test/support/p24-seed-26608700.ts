/**
 * Shrunk Property 24 counterexample from `pnpm test:pbt` (fast-check 4.10.2,
 * numRuns 500), found 2026-11-05. Replay with
 * `fc.assert(prop, { ...runs(), seed, path })`.
 */
import type { Extraction } from "../../src/types";

export const p24Seed26608700: {
  readonly seed: number;
  readonly path: string;
  readonly text: string;
  readonly expected: Extraction;
  readonly garbage: string;
  readonly k: number;
} = {
  seed: 26608700,
  path: "21:4:3:3:3:6:6:6:6:6:6:6:9:9:9:11:10:12:12:13:13:13:13:13:13:13:13:13:14:17:18:20:20:20:21:21:21:21:21:21:21:21:21:21:21:21:24:23:23:23:25:25:25:25:27:27:27:27:27:28:28:28:28:28:28:28:28:28:28:28:28:28:28:28:28:30:30:30:30:30:32:32:32:32:32:32:32:32:32:32:32:32:32:32:32:32:32:32:32:32:32:32:32:32:32:32:34:34:34:34:34:34:34:34:34:34:34:34:34:34:34:34:34:34:34:34:35:35:35:35:35:35:35:35:35:35:35:35:35:35:35:35:35:35:35:35:35:35:35:35:35:35:35:35:35",
  text: 'Fed. R. Civ. P. 1 held 1 A 1 held held "a a a a" See also See Inc. Inc. A\'s A-A A-A, Inc. v. A A & A A & A A-A A, 1600 WL 1 held held 1 U.S.C. § 1 held held "a" 1 A. 1, 1 A. 1 ("a") held held held 1 A. 1, 1 A. 1: "a" held held held A, Inc. v. A, 1 A. at 1 ("a") held',
  expected: {
    citations: [
      {
        start: 0,
        end: 17,
        text: "Fed. R. Civ. P. 1",
        value: { kind: "other", form: "fed_rule", section: "1" },
      },
      {
        start: 23,
        end: 28,
        text: "1 A 1",
        value: { kind: "reporter", volume: 1, reporter: "A.", page: 1 },
        normalised: "1 A. 1",
      },
      {
        start: 114,
        end: 123,
        text: "1600 WL 1",
        value: { kind: "database", year: 1600, designator: "WL", number: 1 },
      },
      {
        start: 134,
        end: 146,
        text: "1 U.S.C. § 1",
        value: { kind: "other", form: "usc", title: 1, section: "1" },
      },
      {
        start: 161,
        end: 175,
        text: "1 A. 1, 1 A. 1",
        value: {
          kind: "parallel",
          members: [
            { volume: 1, reporter: "A.", page: 1 },
            { volume: 1, reporter: "A.", page: 1 },
          ],
        },
      },
      {
        start: 197,
        end: 211,
        text: "1 A. 1, 1 A. 1",
        value: {
          kind: "parallel",
          members: [
            { volume: 1, reporter: "A.", page: 1 },
            { volume: 1, reporter: "A.", page: 1 },
          ],
        },
      },
      {
        start: 232,
        end: 255,
        text: "A, Inc. v. A, 1 A. at 1",
        value: {
          kind: "short",
          form: "party",
          party: "A, Inc. v. A",
          volume: 1,
          reporter: "A.",
          pincite: 1,
          targetStart: 197,
        },
      },
    ],
    quotes: [
      { start: 158, end: 159, text: "a", citationStart: 161, rule: "preceding" },
      { start: 178, end: 179, text: "a", citationStart: 161, rule: "following" },
      { start: 214, end: 215, text: "a", citationStart: 197, rule: "following" },
      { start: 258, end: 259, text: "a", citationStart: 232, rule: "following" },
    ],
  },
  garbage: "1 Aa 1",
  k: 774606180,
};
