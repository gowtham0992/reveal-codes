/**
 * `reveal <file>` (Req 9, design The Reveal_Command): the file's state decides the output and the
 * exit status. Success prints nothing to standard error; a file that is not shown gets one line
 * and exit 1. The decision is a pure function of the facts; `revealFile` loads them.
 */
import type { Document } from "@reveal-codes/engine";
import { staleLine } from "../core/legend.js";
import { neutralize } from "../core/neutralize.js";
import { changeHunks } from "../core/update.js";
import { headerLine, viewRecord } from "../core/view.js";
import type { ViewMode } from "../core/view.js";
import type { Deps } from "./deps.js";
import { loadFile, unchangedDocument } from "./load.js";
import type { FileFacts } from "./load.js";

type RevealDeps = Pick<Deps, "fs" | "git" | "sha256" | "log" | "pid">;

/** The reasons of Requirement 9, criteria 9 and 11. */
export type NotShown = "not_tracked" | "over_limit" | "binary" | "ignored" | "no_record";
export type RevealOutput = { status: 0 | 1; text: string };

/** The characters of the Hunks between `recorded` and `current` (Changed_Characters). */
export function unrecordedCharacters(recorded: string, current: string): number {
  return changeHunks(recorded, current).reduce((n, h) => n + (h.to - h.from) + h.text.length, 0);
}

function notShown(path: string, reason: NotShown | "tampered_record"): RevealOutput {
  const text =
    reason === "tampered_record"
      ? `${neutralize(path)}: tampered_record`
      : `${neutralize(path)}: not recorded: ${reason}`;
  return { status: 1, text };
}

/** The reason for a file that cannot be shown as text, or that has nothing recorded. */
export function reasonOf(facts: FileFacts): NotShown | null {
  const { read } = facts;
  if (read.kind === "absent" || read.kind === "unreadable") return "not_tracked";
  const nothing = facts.record === null && facts.entry === null;
  if (nothing && facts.listed === false) return "ignored";
  if (read.kind === "over_limit" || read.kind === "binary") return read.kind;
  return nothing ? "no_record" : null;
}

/** How to print: the colour choice and whether `--full` asks for full Run_Ids. */
export type How = { mode: ViewMode; full: boolean };
function shown(doc: Document, how: How, path: string, stale: string | null): RevealOutput {
  const view = viewRecord(doc, how.mode, path, how.full);
  return { status: 0, text: stale === null ? view : `${stale}\n${view}` };
}

function staleOf(path: string, count: number): string {
  return staleLine(neutralize(path), count);
}

function entryOutput(facts: FileFacts, text: string, how: How, path: string): RevealOutput {
  const { entry, read, baselineAt, baselineText } = facts;
  if (entry === null || read.kind !== "text" || baselineAt === null)
    return notShown(path, "no_record");
  if (read.sha256 === entry.sha256) {
    const doc = unchangedDocument(text, baselineAt);
    return doc === null ? notShown(path, "no_record") : shown(doc, how, path, null);
  }
  const count = baselineText === null ? text.length : unrecordedCharacters(baselineText, text);
  return { status: 0, text: `${staleOf(path, count)}\n${headerLine(path)}` };
}

/** What `reveal <file>` prints for `path` (workspace-relative) and the exit status. */
export function decideReveal(facts: FileFacts, path: string, how: How): RevealOutput {
  const { record, read } = facts;
  if (record !== null && !record.ok) return notShown(path, "tampered_record");
  const reason = reasonOf(facts);
  if (reason !== null || read.kind !== "text") return notShown(path, reason ?? "not_tracked");
  if (record === null) return entryOutput(facts, read.text, how, path);
  if (record.text === read.text) return shown(record.doc, how, path, null);
  const stale = staleOf(path, unrecordedCharacters(record.text, read.text));
  return shown(record.doc, how, path, stale);
}

/** Loads the file's facts and decides. A failed read is one line and exit 1. */
export async function revealFile(
  deps: RevealDeps,
  root: string,
  path: string,
  how: How,
): Promise<RevealOutput> {
  const facts = await loadFile(deps, root, path);
  if (!facts.ok) return { status: 1, text: `${neutralize(path)}: ${facts.error.kind}` };
  return decideReveal(facts.value, path, how);
}
