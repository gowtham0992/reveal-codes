/**
 * Reveal Codes facade (design A11, A12; Req 20.1, 20.2, 20.6).
 *
 * `parse` runs lex, decode, check, and build in order. It is total: every
 * stage returns a value, and the first fault becomes a `malformed_codes`
 * error carrying the input index and the rule that failed.
 */
import { build } from "./codes/build.js";
import { check } from "./codes/check.js";
import { decodeTokens } from "./codes/decode.js";
import { lexCodes } from "./codes/lex.js";
import type { EngineError, MalformedRule } from "./errors.js";
import { err } from "./result.js";
import type { Result } from "./result.js";
import type { Document } from "./types.js";

export { render } from "./codes/render.js";
export { strip, stripPositions } from "./codes/strip.js";

const malformed = (f: Readonly<{ index: number; rule: MalformedRule }>): EngineError => ({
  kind: "malformed_codes",
  index: f.index,
  rule: f.rule,
});

/**
 * Parses a Full_Rendering back into a Document. `parse(render(d, "full").text)`
 * equals `d` structurally. Returns `malformed_codes` for any fault; never throws.
 */
export function parse(revealCodesText: string): Result<Document, EngineError> {
  const lexed = lexCodes(revealCodesText);
  if (!lexed.ok) return err(malformed(lexed.error));
  const decoded = decodeTokens(lexed.value);
  if (!decoded.ok) return err(malformed(decoded.error));
  const checked = check(decoded.value);
  if (!checked.ok) return err(malformed(checked.error));
  const built = build(checked.value);
  return built.ok ? built : err(malformed(built.error));
}
