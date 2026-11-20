/**
 * A Recorder file-phase environment over in-memory `Deps`: seed Records, baselines and cache files,
 * run the phases as an event would, and read back what they left.
 */
import { createDocument, parseRecord, renderRecord } from "@reveal-codes/engine";
import type { Document } from "@reveal-codes/engine";
import { encodeBaseline } from "../../src/core/baseline-codec.js";
import type { Baseline, WindowState } from "../../src/core/types.js";
import { createBaselineCache } from "../../src/io/baseline-cache.js";
import { recordFiles } from "../../src/io/recorder-files.js";
import type { FilesOutcome, StateStatus } from "../../src/io/recorder-files.js";
import { listCandidates } from "../../src/io/scan.js";
import { createStore } from "../../src/io/store.js";
import { CLOCK_START_MS } from "./clock.js";
import { memoryDeps } from "./memory-deps.js";
import type { MemoryDeps } from "./memory-deps.js";

export const ROOT = "/ws";
export const PROV = `${ROOT}/.kiro/provenance`;
export const AT = "2025-12-31T00:00:00Z";
/** An old modification time, so a hint made at the clock start is not racy. */
export const OLD_MTIME = CLOCK_START_MS - 60_000;
export const WINDOW = { windowRun: "5.3 Build 2026-01-01T00:00:00Z" };

export type RunOptions = {
  window?: { windowRun: string } | null;
  stateStatus?: StateStatus;
  eventIso?: string;
  startMs?: number;
  /** Replaces the state that the previous run left. */
  state?: WindowState;
};

export function emptyState(): WindowState {
  return {
    version: 1,
    order: 0,
    lastWindowRun: null,
    lastEventAt: null,
    recordedAtMs: CLOCK_START_MS,
    noSessionIdLogged: false,
    sessions: {},
    files: {},
    skipped: {},
  };
}

export type Env = {
  deps: MemoryDeps;
  state: WindowState | null;
  put: (path: string, text: string | Uint8Array, mtime?: number) => void;
  seedRecord: (path: string, doc: Document) => void;
  seedBaseline: (files: Record<string, { text: string; inGit?: boolean }>) => Baseline;
  seedCache: (text: string) => string;
  run: (options?: RunOptions) => Promise<FilesOutcome>;
  doc: (path: string) => Document | null;
  recordText: (path: string) => string | null;
  baseline: () => Baseline | null;
  cacheNames: () => string[];
  reasons: () => string[];
};

const enc = new TextEncoder();

export function makeEnv(): Env {
  const deps = memoryDeps();
  const store = createStore(deps, PROV);
  const cache = createBaselineCache(deps, store.cacheDir());
  const env: Env = {
    deps,
    state: null,
    put: (path, text, mtime = OLD_MTIME) => {
      deps.fs.put(`${ROOT}/${path}`, text, mtime);
    },
    seedRecord: (path, doc) => {
      deps.fs.put(`${PROV}/records/${path}.reveal`, renderRecord(doc, null, "full").text);
    },
    seedBaseline: (files) => {
      const entries: Baseline["files"] = {};
      for (const [path, f] of Object.entries(files)) {
        const bytes = enc.encode(f.text);
        const sha256 = deps.sha256(bytes);
        entries[path] = f.inGit === true ? { sha256, blob: deps.git.addBlob(bytes) } : { sha256 };
      }
      const baseline: Baseline = { version: 1, at: AT, files: entries };
      deps.fs.put(`${PROV}/baseline.json`, encodeBaseline(baseline));
      return baseline;
    },
    seedCache: (text) => {
      const bytes = enc.encode(text);
      const digest = deps.sha256(bytes);
      deps.fs.put(`${PROV}/cache/${digest}`, bytes);
      return digest;
    },
    run: async (options = {}) => {
      const candidates = await listCandidates(deps, ROOT);
      const given = options.state ?? env.state;
      const state = given ?? emptyState();
      const outcome = await recordFiles(
        {
          deps,
          root: ROOT,
          store,
          cache,
          event: "agentStop",
          state,
          stateStatus: options.stateStatus ?? (given === null ? "absent" : "ok"),
          baseline: await store.readBaseline(),
          window: options.window === undefined ? WINDOW : options.window,
          eventIso: options.eventIso ?? deps.clock.nowIso(),
          startMs: options.startMs ?? deps.clock.nowMs(),
        },
        candidates.files,
      );
      env.state = outcome.state;
      return outcome;
    },
    doc: (path) => {
      const text = deps.fs.text(`${PROV}/records/${path}.reveal`);
      if (text === null) return null;
      const parsed = parseRecord(text);
      return parsed.ok ? parsed.value.document : null;
    },
    recordText: (path) => deps.fs.text(`${PROV}/records/${path}.reveal`),
    baseline: () => {
      const text = deps.fs.text(`${PROV}/baseline.json`);
      return text === null ? null : (JSON.parse(text) as Baseline);
    },
    cacheNames: () => [...deps.fs.files.keys()].filter((p) => p.startsWith(`${PROV}/cache/`)),
    reasons: () => deps.faults.map((f) => `${f.path ?? "-"} ${f.reason}`),
  };
  return env;
}

export function docOf(text: string, timestamp = AT): Document {
  const made = createDocument(text, timestamp);
  if (!made.ok) throw new Error(made.error.kind);
  return made.value;
}

/** The origins of the spans of a Document, in order. */
export function origins(doc: Document): string[] {
  return doc.spans.map((s) => s.provenance.origin);
}
