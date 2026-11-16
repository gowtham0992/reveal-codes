/** Decoder for the `[DOC]` header: version, key counter, Declaration and run entries. */
import { err, ok } from "../result.js";
import type { Result } from "../result.js";
import type { Declaration } from "../declaration.js";
import type { RunEntry } from "../types.js";
import type { DecodeFault } from "./decode-types.js";
import { readDeclaration, readInt, readRuns, readVersion } from "./decode-fields.js";
import type { CodeToken } from "./lex.js";

export type Header = Readonly<{
  keyCounter: number;
  runs: readonly RunEntry[];
  declaration?: Declaration;
}>;

const bad = (code: CodeToken): DecodeFault => ({ index: code.index, rule: "bad_field" });

export function decodeHeader(code: CodeToken): Result<Header, DecodeFault> {
  const v = readVersion(code);
  const n = readInt(code, "n");
  const runs = readRuns(code);
  const d = readDeclaration(code);
  if (!v.ok || v.value === undefined || !n.ok || n.value === undefined || runs === undefined) {
    return err(bad(code));
  }
  if (!d.ok) return err(bad(code));
  const header = { keyCounter: n.value, runs };
  return ok(d.value === undefined ? header : { ...header, declaration: d.value });
}
