import * as fc from "fast-check";
import { setVerification } from "@reveal-codes/engine";
import type { Document, IssueKey, VerificationResult } from "@reveal-codes/engine";
import type { DisplayInfo } from "@reveal-codes/verifier/link";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resolvedRows } from "../src/client/resolved";
import { summaryLines } from "../src/client/verify-summary";
import type { ResolvedSession } from "../src/client/resolved";
import { CLUSTER_POOL, arbCitingDocument, arbUnreadableStored } from "./arbitraries";
import { arbCreatedDocument } from "../../../packages/engine/src/testing/arb-document";
import { arbOpSequence } from "../../../packages/engine/src/testing/arb-ops";
import { createAutosave } from "../src/autosave";
import { startAutosave } from "../src/components/use-autosave";
import { createDraftGate } from "../src/draft-gate";
import { AUTOSAVE_KEY, deserialise } from "../src/persist";
import type { AppServices } from "../src/services";
import { createStore } from "../src/store-runtime";
import { createManualTimers } from "./support/clock";
import { runs } from "./support/fc";
import { createMemoryStorage } from "./support/memory-storage";
import { modeApi } from "./support/mode-fetch";
import { createFakeViewport } from "./support/viewport";

const OTHER_CLUSTER = "999";

type InfoKind = "none" | "same" | "other";

type Choice = Readonly<{
  result: VerificationResult;
  infoKind: InfoKind;
  foundYear: number | undefined;
  absoluteUrl: string | undefined;
}>;

const arbCluster = fc.constantFrom(...CLUSTER_POOL);

const arbResult: fc.Arbitrary<VerificationResult> = fc.oneof(
  {
    arbitrary: arbCluster.map((clusterId) => ({ status: "verified" as const, clusterId })),
    weight: 4,
  },
  {
    arbitrary: arbCluster.map((clusterId) => ({
      status: "wrong_case" as const,
      clusterId,
      foundName: "Some Other v. Case",
      foundYear: 2009,
    })),
    weight: 2,
  },
  { arbitrary: fc.constant({ status: "not_found" as const }), weight: 1 },
  { arbitrary: fc.constant({ status: "unchecked" as const }), weight: 1 },
  {
    arbitrary: fc.constant({ status: "ambiguous" as const, candidates: ["101", "102"] }),
    weight: 1,
  },
);

const arbChoice: fc.Arbitrary<Choice> = fc.record({
  result: arbResult,
  infoKind: fc.constantFrom<InfoKind>("none", "same", "same", "other"),
  foundYear: fc.option(fc.integer({ min: 1000, max: 2100 }), { nil: undefined }),
  absoluteUrl: fc.option(fc.constantFrom("/opinion/101/x/", "/opinion/102/y/"), { nil: undefined }),
});

type Scenario = Readonly<{
  doc: Document;
  info: ReadonlyMap<IssueKey, DisplayInfo>;
  /** Whether a session exists, its epoch and the current epoch. */
  session: ReadonlyArray<number> | null;
  currentEpoch: number;
}>;

function infoFor(key: IssueKey, c: Choice, doc: Document): DisplayInfo | null {
  if (c.infoKind === "none") return null;
  const rec = doc.citations.find((x) => x.kind === "full" && x.key === key);
  const own =
    rec !== undefined && rec.kind === "full" && "clusterId" in rec.result
      ? rec.result.clusterId
      : CLUSTER_POOL[0];
  return {
    clusterId: c.infoKind === "same" ? (own ?? OTHER_CLUSTER) : OTHER_CLUSTER,
    foundName: `Found ${key}`,
    ...(c.foundYear === undefined ? {} : { foundYear: c.foundYear }),
    ...(c.absoluteUrl === undefined ? {} : { absoluteUrl: c.absoluteUrl }),
  };
}

function assign(doc: Document, choices: readonly Choice[]): Scenario["doc"] {
  let current = doc;
  const fulls = doc.citations.filter((c) => c.kind === "full");
  fulls.forEach((c, i) => {
    const choice = choices[i % choices.length];
    if (choice === undefined) return;
    const next = setVerification(current, c.key, choice.result);
    if (next.ok) current = next.value;
  });
  return current;
}

const arbScenario: fc.Arbitrary<{
  doc: Document;
  choices: readonly Choice[];
  session: readonly [number] | null;
  currentEpoch: number;
}> = fc.record({
  doc: arbCitingDocument,
  choices: fc.array(arbChoice, { minLength: 1, maxLength: 8 }),
  session: fc.option(fc.tuple(fc.nat({ max: 3 })), { nil: null }),
  currentEpoch: fc.nat({ max: 3 }),
});

function foundTextOf(info: DisplayInfo): string {
  return info.foundYear === undefined
    ? info.foundName
    : `${info.foundName} (${String(info.foundYear)})`;
}

describe("Resolved list selection _Requirements: 7.5, 7.12, 7.13, 7.14, 7.15, 7.17_", () => {
  // Property 16
  it("lists exactly the verified Full_Citations in order, with found text only for a current, same-cluster Display_Info", () => {
    fc.assert(
      fc.property(arbScenario, (s) => {
        const doc = assign(s.doc, s.choices);
        const fulls = doc.citations.filter((c) => c.kind === "full");
        const info = new Map<IssueKey, DisplayInfo>();
        fulls.forEach((c, i) => {
          const choice = s.choices[i % s.choices.length];
          const made = choice === undefined ? null : infoFor(c.key, choice, doc);
          if (made !== null) info.set(c.key, made);
        });
        const session: ResolvedSession = s.session === null ? null : { epoch: s.session[0], info };
        const rows = resolvedRows(doc, session, s.currentEpoch);

        if (session === null) {
          expect(rows).toBeNull();
          return;
        }
        const expected = doc.citations.flatMap((c) =>
          c.kind === "full" && c.result.status === "verified" ? [c] : [],
        );
        expect(rows).not.toBeNull();
        expect((rows ?? []).map((r) => r.key)).toEqual(expected.map((c) => c.key));
        (rows ?? []).forEach((row, i) => {
          const c = expected[i];
          if (c === undefined || c.result.status !== "verified") throw new Error("unreachable");
          const d = info.get(c.key);
          const usable =
            session.epoch === s.currentEpoch &&
            d !== undefined &&
            d.clusterId === c.result.clusterId;
          expect(row.clusterId).toBe(c.result.clusterId);
          expect(row.found).toBe(usable ? foundTextOf(d) : null);
        });
      }),
      { numRuns: runs() },
    );
  });
});

describe("Citations line _Requirements: 7.9_", () => {
  // Property 17
  it("lists found, wrong case, not found, ambiguous, not checked in order, each only when above zero", () => {
    fc.assert(
      fc.property(arbScenario, (s) => {
        const doc = assign(s.doc, s.choices);
        const fulls = doc.citations.flatMap((c) => (c.kind === "full" ? [c.result.status] : []));
        const count = (status: string): number => fulls.filter((x) => x === status).length;
        const expectedTerms = [
          [count("verified"), "found"],
          [count("wrong_case"), "wrong case"],
          [count("not_found"), "not found"],
          [count("ambiguous"), "ambiguous"],
          [count("unchecked"), "not checked"],
        ]
          .filter(([n]) => (n as number) > 0)
          .map(([n, t]) => `${String(n)} ${String(t)}`);
        const line = summaryLines(doc, "2026-01-01T12:00:00Z", null).find((l) =>
          l.startsWith("Citations:"),
        );
        if (expectedTerms.length === 0) {
          expect(line).toBeUndefined();
          return;
        }
        expect(line).toBe(`Citations: ${expectedTerms.join(" · ")}`);
        const wrong = count("wrong_case");
        expect(line?.includes(`${String(wrong)} wrong case`) ?? false).toBe(wrong > 0);
        expect(line?.includes("wrong case") ?? false).toBe(wrong > 0);
      }),
      { numRuns: runs() },
    );
  });
});

describe("An unreadable stored draft is never changed _Requirements: 23.23_", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // Property 20
  it("load, edits, a wait, flush, hidden and unmount leave the stored value equal and call setItem zero times", () => {
    const arbRun = arbCreatedDocument.chain((start) =>
      arbOpSequence(start).map((ops) => ({ start, ops })),
    );
    fc.assert(
      fc.property(
        arbUnreadableStored,
        arbRun,
        fc.integer({ min: 300, max: 5000 }),
        (raw, { start, ops }, wait) => {
          const rejected = deserialise(raw);
          expect(!rejected.ok && rejected.error.kind !== "absent").toBe(true);

          const storage = createMemoryStorage();
          (storage.data as Map<string, string>).set(AUTOSAVE_KEY, raw);
          const timers = createManualTimers();
          const services: AppServices = {
            api: modeApi("fixtures").api,
            now: timers.clock.now,
            setTimer: (fn, ms) => timers.setTimeout(fn, ms),
            clearTimer: (h) => {
              timers.clearTimeout(h as number);
            },
            storage,
            download: () => undefined,
            openPrint: () => true,
            viewport: createFakeViewport(1280),
          };
          const gate = createDraftGate();
          const store = createStore(timers.clock.now);
          const autosave = createAutosave({
            storage,
            setTimer: services.setTimer,
            clearTimer: services.clearTimer,
            onError: () => undefined,
            gate,
          });

          const fakeDocument = Object.assign(new EventTarget(), { visibilityState: "visible" });
          vi.stubGlobal("document", fakeDocument);
          vi.stubGlobal("window", new EventTarget());
          const stop = startAutosave(services, store, autosave, gate);
          store.dispatch({ type: "replace", document: start, runLog: [], verifiedAt: null });
          store.dispatch({ type: "edit", ops });
          timers.advance(wait);
          autosave.flush();
          fakeDocument.visibilityState = "hidden";
          fakeDocument.dispatchEvent(new Event("visibilitychange"));
          stop();

          expect(storage.getItem(AUTOSAVE_KEY)).toBe(raw);
          expect(storage.writes()).toBe(0);
          expect(gate.blocked()).toBe(true);
        },
      ),
      { numRuns: runs() },
    );
  });
});
