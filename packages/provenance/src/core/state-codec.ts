import { err, ok } from "@reveal-codes/engine";
import type { Result } from "@reveal-codes/engine";
import { validAt } from "./baseline-codec.js";
import type {
  ClosedBy,
  FileCache,
  OpenWindow,
  ProvenanceError,
  SessionState,
  SkippedFile,
  WindowState,
} from "./types.js";

type Obj = Readonly<Record<string, unknown>>;
type Dec<T> = (value: unknown, where: string) => Result<T, ProvenanceError>;

const SHA256_RE = /^[0-9a-f]{64}$/u;
const CLOSED_BY: readonly unknown[] = ["postTask", "agentStop", "sweep", "leftover"];

function bad(detail: string): Result<never, ProvenanceError> {
  return err({ kind: "bad_state", detail });
}

function isObj(value: unknown): value is Obj {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseJson(text: string): Result<unknown, ProvenanceError> {
  try {
    return ok(JSON.parse(text) as unknown);
  } catch {
    // Non-JSON text is the defined error case, returned as a value.
    return bad("not JSON");
  }
}

/** An object whose keys are exactly `required` plus any of `optional`. */
function shape(
  v: unknown,
  where: string,
  required: string[],
  optional: string[] = [],
): Result<Obj, ProvenanceError> {
  if (!isObj(v)) return bad(`${where} is not an object`);
  const missing = required.find((key) => !(key in v));
  if (missing !== undefined) return bad(`${where} lacks ${missing}`);
  const extra = Object.keys(v).find((k) => !required.includes(k) && !optional.includes(k));
  return extra === undefined ? ok(v) : bad(`${where} has unknown key ${extra}`);
}

function isNum(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && v >= 0;
}

function isCount(v: unknown): v is number {
  return isNum(v) && Number.isInteger(v);
}

function isNullable(v: unknown, test: (x: unknown) => boolean): boolean {
  return v === null || test(v);
}

function isStr(v: unknown): v is string {
  return typeof v === "string";
}

function decodeWindow(v: unknown, where: string): Result<OpenWindow, ProvenanceError> {
  const s = shape(
    v,
    where,
    ["windowRun", "label", "taskNumber", "kind", "openedAt", "order"],
    ["spec", "taskName"],
  );
  if (!s.ok) return s;
  const o = s.value;
  const { windowRun, label, taskNumber, kind, openedAt, order, spec, taskName } = o;
  if (!isStr(windowRun) || !isStr(label)) return bad(`bad window text: ${where}`);
  if (!isNullable(taskNumber, isStr)) return bad(`bad taskNumber: ${where}`);
  if (kind !== "turn" && kind !== "task") return bad(`bad kind: ${where}`);
  if (!validAt(openedAt) || !isCount(order)) return bad(`bad openedAt or order: ${where}`);
  if (spec !== undefined && !isStr(spec)) return bad(`bad spec: ${where}`);
  if (taskName !== undefined && (!isStr(taskName) || taskName === ""))
    return bad(`bad taskName: ${where}`);
  const base: OpenWindow = {
    windowRun,
    label,
    taskNumber: taskNumber as string | null,
    kind: kind === "turn" ? "turn" : "task",
    openedAt,
    order,
  };
  const withSpec = spec === undefined ? base : { ...base, spec };
  return ok(taskName === undefined ? withSpec : { ...withSpec, taskName });
}

function decodeList<T>(v: unknown, where: string, item: Dec<T>): Result<T[], ProvenanceError> {
  if (!Array.isArray(v)) return bad(`${where} is not an array`);
  const out: T[] = [];
  for (const [i, raw] of (v as unknown[]).entries()) {
    const r = item(raw, `${where}[${String(i)}]`);
    if (!r.ok) return r;
    out.push(r.value);
  }
  return ok(out);
}

function decodeMap<T>(
  v: unknown,
  where: string,
  item: Dec<T>,
): Result<Record<string, T>, ProvenanceError> {
  if (!isObj(v)) return bad(`${where} is not an object`);
  const pairs: [string, T][] = [];
  for (const [key, raw] of Object.entries(v)) {
    const r = item(raw, `${where}.${key}`);
    if (!r.ok) return r;
    pairs.push([key, r.value]);
  }
  // fromEntries defines own properties, so a key such as `__proto__` stays data.
  return ok(Object.fromEntries(pairs));
}

function decodeSession(v: unknown, where: string): Result<SessionState, ProvenanceError> {
  const keys = ["lastEventAt", "lastClosedBy", "promptSeen", "noPromptCounted", "windows"];
  const s = shape(v, where, keys);
  if (!s.ok) return s;
  const { lastEventAt, lastClosedBy, promptSeen, noPromptCounted, windows } = s.value;
  if (!validAt(lastEventAt)) return bad(`bad lastEventAt: ${where}`);
  if (lastClosedBy !== null && !CLOSED_BY.includes(lastClosedBy))
    return bad(`bad lastClosedBy: ${where}`);
  if (typeof promptSeen !== "boolean" || typeof noPromptCounted !== "boolean")
    return bad(`bad flag: ${where}`);
  const stack = decodeList(windows, `${where}.windows`, decodeWindow);
  if (!stack.ok) return stack;
  return ok({
    lastEventAt,
    lastClosedBy: lastClosedBy as ClosedBy | null,
    promptSeen,
    noPromptCounted,
    windows: stack.value,
  });
}

function decodeFileCache(v: unknown, where: string): Result<FileCache, ProvenanceError> {
  const s = shape(v, where, ["size", "mtimeMs", "digest", "seenMs"]);
  if (!s.ok) return s;
  const { size, mtimeMs, digest, seenMs } = s.value;
  if (!isCount(size) || !isNum(mtimeMs) || !isNum(seenMs)) return bad(`bad number: ${where}`);
  if (!isStr(digest) || !SHA256_RE.test(digest)) return bad(`bad digest: ${where}`);
  return ok({ size, mtimeMs, digest, seenMs });
}

function decodeSkipped(v: unknown, where: string): Result<SkippedFile, ProvenanceError> {
  const s = shape(v, where, ["size", "mtimeMs", "reason"]);
  if (!s.ok) return s;
  const { size, mtimeMs, reason } = s.value;
  if (!isCount(size) || !isNum(mtimeMs) || reason !== "over_limit")
    return bad(`bad entry: ${where}`);
  return ok({ size, mtimeMs, reason });
}

type Maps = Pick<WindowState, "sessions" | "files" | "skipped">;
function decodeMaps(r: Obj): Result<Maps, ProvenanceError> {
  const sessions = decodeMap(r["sessions"], "sessions", decodeSession);
  if (!sessions.ok) return sessions;
  const files = decodeMap(r["files"], "files", decodeFileCache);
  if (!files.ok) return files;
  const skipped = decodeMap(r["skipped"], "skipped", decodeSkipped);
  if (!skipped.ok) return skipped;
  return ok({ sessions: sessions.value, files: files.value, skipped: skipped.value });
}
/**
 * Read state.json (Req 3.17, 5.16): `version` 1 and exactly the fields of
 * `WindowState` (`lastHookEventAt` is optional, Req 3.29). Any other shape, a session
 * entry without `lastClosedBy`, `promptSeen` or `noPromptCounted` included, is an error
 * value. Never throws.
 */
export function decodeState(text: string): Result<WindowState, ProvenanceError> {
  const parsed = parseJson(text);
  if (!parsed.ok) return parsed;
  const keys = ["version", "order", "lastWindowRun", "lastEventAt", "recordedAtMs"];
  const required = [...keys, "noSessionIdLogged", "sessions", "files", "skipped"];
  const s = shape(parsed.value, "state", required, ["lastHookEventAt"]);
  if (!s.ok) return s;
  const r = s.value;
  if (r["version"] !== 1) return bad("unsupported version");
  const { order, lastWindowRun, lastEventAt, recordedAtMs, noSessionIdLogged } = r;
  if (!isCount(order) || !isNum(recordedAtMs)) return bad("bad counter");
  if (!isNullable(lastWindowRun, isStr)) return bad("bad lastWindowRun");
  if (lastEventAt !== null && !validAt(lastEventAt)) return bad("bad lastEventAt");
  const hookAt = r["lastHookEventAt"];
  if (hookAt !== undefined && !validAt(hookAt)) return bad("bad lastHookEventAt");
  if (typeof noSessionIdLogged !== "boolean") return bad("bad noSessionIdLogged");
  const maps = decodeMaps(r);
  if (!maps.ok) return maps;
  return ok({
    version: 1,
    order,
    lastWindowRun: lastWindowRun as string | null,
    lastEventAt,
    ...(hookAt === undefined ? {} : { lastHookEventAt: hookAt }),
    recordedAtMs,
    noSessionIdLogged,
    ...maps.value,
  });
}
function sortedMap<T, U>(map: Readonly<Record<string, T>>, f: (value: T) => U): Record<string, U> {
  return Object.fromEntries(
    Object.keys(map)
      .sort()
      .map((key) => [key, f(map[key] as T)] as const),
  );
}

function windowJson(w: OpenWindow): Record<string, unknown> {
  const base = {
    windowRun: w.windowRun,
    label: w.label,
    taskNumber: w.taskNumber,
    kind: w.kind,
    openedAt: w.openedAt,
    order: w.order,
  };
  const withSpec = w.spec === undefined ? base : { ...base, spec: w.spec };
  return w.taskName === undefined ? withSpec : { ...withSpec, taskName: w.taskName };
}

function sessionJson(s: SessionState): Record<string, unknown> {
  return {
    lastEventAt: s.lastEventAt,
    lastClosedBy: s.lastClosedBy,
    promptSeen: s.promptSeen,
    noPromptCounted: s.noPromptCounted,
    windows: s.windows.map(windowJson),
  };
}

/**
 * The text of state.json: two-space JSON ending in a line feed, map keys in
 * UTF-16 code unit order so the same state gives the same bytes. The Session_Key
 * is written here and nowhere else (Req 3.25).
 */
export function encodeState(state: WindowState): string {
  const json = {
    version: 1,
    order: state.order,
    lastWindowRun: state.lastWindowRun,
    lastEventAt: state.lastEventAt,
    ...(state.lastHookEventAt === undefined ? {} : { lastHookEventAt: state.lastHookEventAt }),
    recordedAtMs: state.recordedAtMs,
    noSessionIdLogged: state.noSessionIdLogged,
    sessions: sortedMap(state.sessions, sessionJson),
    files: sortedMap(state.files, (f) => ({
      size: f.size,
      mtimeMs: f.mtimeMs,
      digest: f.digest,
      seenMs: f.seenMs,
    })),
    skipped: sortedMap(state.skipped, (k) => ({
      size: k.size,
      mtimeMs: k.mtimeMs,
      reason: k.reason,
    })),
  };
  return `${JSON.stringify(json, null, 2)}\n`;
}

/** The text of sessions.json: one line of JSON ending in a line feed (Req 3.27). */
export function encodeSessions(count: number): string {
  return `{ "version": 1, "noPromptEventSessions": ${String(count)} }\n`;
}

function badSessions(detail: string): Result<never, ProvenanceError> {
  return err({ kind: "bad_sessions", detail });
}

/** Read sessions.json: exactly `version` 1 and a non-negative integer count. Never throws. */
export function decodeSessions(text: string): Result<number, ProvenanceError> {
  let root: unknown;
  try {
    root = JSON.parse(text) as unknown;
  } catch {
    // Non-JSON text is the defined error case, returned as a value.
    return badSessions("not JSON");
  }
  const s = shape(root, "sessions.json", ["version", "noPromptEventSessions"]);
  if (!s.ok) return badSessions(s.error.detail ?? "bad shape");
  if (s.value["version"] !== 1) return badSessions("unsupported version");
  const n = s.value["noPromptEventSessions"];
  return isCount(n) ? ok(n) : badSessions("bad count");
}
