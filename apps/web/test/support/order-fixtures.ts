import { apply, createDocument } from "@reveal-codes/engine";
import type { Document } from "@reveal-codes/engine";
import { ORDERS } from "@reveal-codes/export";
import type { OrderEntry } from "@reveal-codes/export";
import { ISO } from "./persist-fixtures";

export const HUM_TEXT = "Plain text with no citation.\n";
export const AI_TEXT = "The movant relies on the record.";

function must<T>(r: { ok: true; value: T } | { ok: false; error: { kind: string } }): T {
  if (!r.ok) throw new Error(`fixture rejected: ${r.error.kind}`);
  return r.value;
}

/** Typed paragraph 1 and no AI text: gate-clear, `usedAi` false. */
export function humanDocument(): Document {
  const created = must(createDocument("", ISO));
  const op = {
    kind: "insert",
    at: 0,
    text: HUM_TEXT,
    provenance: { origin: "HUM", timestamp: ISO },
  } as const;
  return must(apply(created, op)).document;
}

/** `humanDocument` plus one AI-origin span (run `run-1`) that fills paragraph 2. */
export function aiDocument(): Document {
  const base = humanDocument();
  const op = {
    kind: "insert",
    at: base.text.length,
    text: AI_TEXT,
    provenance: { origin: "AI", runId: "run-1", timestamp: ISO },
  } as const;
  return must(apply(base, op)).document;
}

export function entryOf(id: string): OrderEntry {
  const entry = ORDERS.entries.find((e) => e.id === id);
  if (entry === undefined) throw new Error(`no entry ${id}`);
  return entry;
}

/** A citation left unverified (one Blocking_Issue) followed by an AI-origin span. */
export function aiDocumentWithCitation(): Document {
  const created = must(createDocument("See Roe v. Wade, 410 U.S. 113 (1973).", ISO));
  const op = {
    kind: "insert",
    at: created.text.length,
    text: ` ${AI_TEXT}`,
    provenance: { origin: "AI", runId: "run-1", timestamp: ISO },
  } as const;
  return must(apply(created, op)).document;
}
