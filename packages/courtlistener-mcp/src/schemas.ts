import { err, ok } from "@reveal-codes/engine";
import type { Result } from "@reveal-codes/engine";
import { z } from "zod";

export const MAX_CITATIONS = 50;
export const MAX_CITATION_CHARS = 2000;
export const MAX_QUOTE_CHARS = 10_000;

const citationString = z
  .string({ message: "expected a string of 1 to 2000 characters" })
  .min(1, "expected a string of 1 to 2000 characters")
  .max(MAX_CITATION_CHARS, "expected a string of 1 to 2000 characters");

const clusterId = z
  .number({ message: "expected a positive integer" })
  .int("expected a positive integer")
  .positive("expected a positive integer")
  .safe("expected a positive integer");

export const lookupCitationsShape = {
  citations: z
    .array(citationString, { message: "expected an array of 1 to 50 strings" })
    .min(1, "expected an array of 1 to 50 strings")
    .max(MAX_CITATIONS, "expected an array of 1 to 50 strings"),
};

export const getOpinionTextShape = { clusterId };

export const checkQuoteShape = {
  clusterId,
  quote: z
    .string({ message: "expected a string of 1 to 10000 characters" })
    .min(1, "expected a string of 1 to 10000 characters")
    .max(MAX_QUOTE_CHARS, "expected a string of 1 to 10000 characters"),
};

/** `citations[3]`, `clusterId`: the Zod path in the form a reader expects. */
function pathName(path: readonly (string | number)[]): string {
  return path.reduce<string>(
    (acc, p) => (typeof p === "number" ? `${acc}[${String(p)}]` : acc === "" ? p : `${acc}.${p}`),
    "",
  );
}

/**
 * Validates `args` against `shape`. The error names the first invalid argument, for
 * example `citations[3]: expected a string of 1 to 2000 characters`; a missing argument
 * reads `clusterId: expected a positive integer`.
 */
export function parseArgs<S extends z.ZodRawShape>(
  shape: S,
  args: unknown,
): Result<z.infer<z.ZodObject<S>>, string> {
  const parsed = z.object(shape).safeParse(args ?? {});
  if (parsed.success) return ok(parsed.data);
  const [first] = parsed.error.issues;
  if (first === undefined) return err("arguments: invalid");
  return err(`${pathName(first.path)}: ${first.message}`);
}
