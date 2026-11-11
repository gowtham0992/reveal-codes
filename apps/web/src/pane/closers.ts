import type { CodePosition } from "@reveal-codes/engine";
import { codeFamily } from "./layout";
import type { CodeFamily } from "./layout";

type Kind = "CIT" | "QUO" | "REF";

/** Name of a display token: the text between `[` and the first `:`, `{` or `]`. */
function nameOf(token: string): string {
  const body = token.startsWith("[") ? token.slice(1) : token;
  const end = body.search(/[:{\]]/);
  return end < 0 ? body : body.slice(0, end);
}

function openerKind(name: string): Kind | null {
  if (name === "REF") return "REF";
  if (name.startsWith("CIT ")) return "CIT";
  if (name.startsWith("QUO ")) return "QUO";
  return null;
}

function closerKind(name: string): Kind | null {
  if (name === "/CIT") return "CIT";
  if (name === "/QUO") return "QUO";
  if (name === "/REF") return "REF";
  return null;
}

/**
 * The family of the opener each closer pairs with, parallel to `positions`. Citations,
 * quotations and references each have their own stack, so a quotation inside a citation never
 * consumes the citation's closer. Every other code, and a closer with no opener, gives null.
 * Reads only `positions`.
 */
export function openerFamilies(positions: readonly CodePosition[]): readonly (CodeFamily | null)[] {
  const stacks: Readonly<Record<Kind, CodeFamily[]>> = { CIT: [], QUO: [], REF: [] };
  return positions.map((p) => {
    const name = nameOf(p.code);
    const opens = openerKind(name);
    if (opens !== null) {
      stacks[opens].push(codeFamily(p.code));
      return null;
    }
    const closes = closerKind(name);
    return closes === null ? null : (stacks[closes].pop() ?? null);
  });
}
