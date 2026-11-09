import { err, ok } from "@reveal-codes/engine";
import type { Result } from "@reveal-codes/engine";

export type Command =
  | Readonly<{ kind: "sweep"; dir: string; json: string | null; out: string | null }>
  | Readonly<{ kind: "check"; file: string; json: string | null; out: string | null }>;

export type UsageError = Readonly<{ message: string }>;

export const USAGE: string = [
  "usage: sentinel sweep <dir> [--json <file>] [--out <file>]",
  "       sentinel check <file.docx> [--json <file>] [--out <file>]",
].join("\n");

type Parsed = Readonly<{ operand: string; json: string | null; out: string | null }>;

function usage(message: string): Result<never, UsageError> {
  return err({ message });
}

/** Parses the tokens after the command: one operand and the options --json and --out. */
function parseRest(rest: readonly string[]): Result<Parsed, UsageError> {
  let operand: string | null = null;
  let json: string | null = null;
  let out: string | null = null;
  for (let i = 0; i < rest.length; i += 1) {
    const token = rest[i] as string;
    if (token === "--json" || token === "--out") {
      const value = rest[i + 1];
      if (value === undefined || value.startsWith("--")) return usage(`option ${token} needs a file`);
      if ((token === "--json" ? json : out) !== null) return usage(`option ${token} given twice`);
      if (token === "--json") json = value;
      else out = value;
      i += 1;
    } else if (token.startsWith("--")) {
      return usage(`unknown option: ${token}`);
    } else if (operand !== null) {
      return usage(`unexpected argument: ${token}`);
    } else {
      operand = token;
    }
  }
  if (operand === null) return usage("missing argument");
  return ok({ operand, json, out });
}

/** Parses the command line (without node and script). Total: never throws. */
export function parseArgs(argv: readonly string[]): Result<Command, UsageError> {
  const name = argv[0];
  if (name === undefined) return usage("no command given");
  if (name !== "sweep" && name !== "check") return usage(`unknown command: ${name}`);
  const parsed = parseRest(argv.slice(1));
  if (!parsed.ok) return parsed;
  const { operand, json, out } = parsed.value;
  return ok(
    name === "sweep"
      ? { kind: "sweep", dir: operand, json, out }
      : { kind: "check", file: operand, json, out },
  );
}
