import { apply, createDocument, setVerification } from "@reveal-codes/engine";
import type { Document } from "@reveal-codes/engine";
import { ORDERS } from "@reveal-codes/export";
import type { OrderEntry } from "@reveal-codes/export";
import { ISO } from "./persist-fixtures";

function must<T>(r: { ok: true; value: T } | { ok: false; error: { kind: string } }): T {
  if (!r.ok) throw new Error(`fixture rejected: ${r.error.kind}`);
  return r.value;
}

/** Typed text with no citation: gate-clear and no AI-origin span. */
export function printHumanDocument(): Document {
  const created = must(createDocument("", ISO));
  const op = {
    kind: "insert",
    at: 0,
    text: "The movant asks for more time to respond.\n",
    provenance: { origin: "HUM", timestamp: ISO },
  } as const;
  return must(apply(created, op)).document;
}

/** The typed document plus one AI-origin span (run `r1`) in paragraph 2. */
export function printAiDocument(): Document {
  const base = printHumanDocument();
  const op = {
    kind: "insert",
    at: base.text.length,
    text: "The Court has discretion to extend the period.",
    provenance: { origin: "AI", runId: "r1", timestamp: ISO },
  } as const;
  return must(apply(base, op)).document;
}

/** One citation recorded not found and no override: one Blocking_Issue. */
export function printBlockedDocument(): Document {
  const created = must(createDocument("See Foo v. Bar, 999 U.S. 999 (2020).", ISO));
  const full = created.citations.find((c) => c.kind === "full");
  if (full === undefined) throw new Error("no citation");
  return must(setVerification(created, full.key, { status: "not_found" }));
}

export function printEntry(id: string): OrderEntry {
  const entry = ORDERS.entries.find((e) => e.id === id);
  if (entry === undefined) throw new Error(`no entry ${id}`);
  return entry;
}
