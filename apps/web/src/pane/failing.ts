import type { CodePosition } from "@reveal-codes/engine";

const FAILING_OPENERS: ReadonlySet<string> = new Set(["CIT ✘", "CIT ?", "QUO ✘"]);
const OTHER_OPENERS: ReadonlySet<string> = new Set(["CIT ✓", "CIT …", "QUO ✓", "QUO …"]);

/** Name of a display token: the text between `[` and the first `:`, `{` or `]`. */
function nameOf(token: string): string {
  const body = token.startsWith("[") ? token.slice(1) : token;
  const end = body.search(/[:{\]]/);
  return end < 0 ? body : body.slice(0, end);
}

/**
 * Whether each code is a Failing_Code, parallel to `positions`. A citation and a quotation
 * each have their own stack, so a quotation inside a citation never consumes its closer.
 * Reads only `positions`.
 */
export function failingFlags(positions: readonly CodePosition[]): readonly boolean[] {
  const stacks: Readonly<Record<"CIT" | "QUO", boolean[]>> = { CIT: [], QUO: [] };
  return positions.map((p) => {
    const name = nameOf(p.code);
    const kind = name.startsWith("CIT") ? "CIT" : name.startsWith("QUO") ? "QUO" : null;
    if (kind !== null && FAILING_OPENERS.has(name)) {
      stacks[kind].push(true);
      return true;
    }
    if (kind !== null && OTHER_OPENERS.has(name)) {
      stacks[kind].push(false);
      return false;
    }
    if (name === "/CIT") return stacks.CIT.pop() ?? false;
    if (name === "/QUO") return stacks.QUO.pop() ?? false;
    return false;
  });
}
