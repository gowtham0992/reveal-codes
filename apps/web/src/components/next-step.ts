export type NextStep = "load-demo" | "verify" | "export" | "none";

export type NextStepInput = Readonly<{
  /** Document text has zero characters. */
  empty: boolean;
  /** A Verify run is in flight. */
  verifying: boolean;
  /** Unchecked citations plus unchecked quotations that Verify can act on. */
  verifiableUnchecked: number;
  /** The Document is in the Check_Date_Gap and Verify can run (see needsCheckDate). */
  needsCheckDate: boolean;
  /** Length of the blocking issues; ignored by the rules. */
  blocking: number;
}>;

/** The first matching rule decides; blocking items never change the result. */
export function nextStep(input: NextStepInput): NextStep {
  if (input.verifying) return "none";
  if (input.empty) return "load-demo";
  if (input.verifiableUnchecked > 0 || input.needsCheckDate) return "verify";
  return "export";
}

export const PRIMARY_LABEL = {
  "load-demo": "Load demo motion",
  verify: "Verify",
  export: "Export",
} as const;
