import { createDocument, renderRecord } from "@reveal-codes/engine";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { updateRecord } from "../../src/core/update.js";
import type { TempDir } from "./temp-repo.js";

const AT = "2026-11-19T10:00:00Z";
const PROV = ".kiro/provenance";

/** A Record whose recorded text is `current`, built from `base` with one outside change. */
export function record(d: TempDir, path: string, base: string, current: string): void {
  const made = createDocument(base, AT);
  if (!made.ok) throw new Error("createDocument failed");
  const edited = updateRecord(made.value, current, "HUM", null, { nowIso: () => AT });
  if (!edited.ok) throw new Error(edited.error.kind);
  d.write(`${PROV}/records/${path}.reveal`, renderRecord(edited.value, null, "full").text);
}
/** Every file under the Record_Directory with its modification time and size. */
export function snapshot(d: TempDir): string[] {
  const out: string[] = [];
  const walk = (rel: string): void => {
    for (const e of readdirSync(`${d.root}/${rel}`, { withFileTypes: true })) {
      const path = `${rel}/${e.name}`;
      if (e.isDirectory()) walk(path);
      else out.push(`${path} ${String(statSync(`${d.root}/${path}`).mtimeMs)}`);
    }
  };
  walk(PROV);
  return out.sort();
}

/** The number of open windows in state.json. */
export function windowsOf(d: TempDir): number {
  const state = JSON.parse(readFileSync(`${d.root}/${PROV}/state.json`, "utf8")) as {
    sessions: Record<string, { windows: unknown[] }>;
  };
  return Object.values(state.sessions).reduce((n, s) => n + s.windows.length, 0);
}
