import type { Document } from "@reveal-codes/engine";
import { summaryLines } from "../client/verify-summary";
import styles from "./verify-result.module.css";

export type VerifyResultProps = Readonly<{
  document: Document;
  verifiedAt: string | null;
  further: string | null;
}>;

/** The Verify_Summary: always rendered, empty until a Verify has completed. */
export function VerifyResult({ document, verifiedAt, further }: VerifyResultProps) {
  const lines = verifiedAt === null ? [] : summaryLines(document, verifiedAt, further);
  return (
    <div role="status" aria-label="Verify result" className={styles["result"]}>
      {lines.map((text) => (
        <p key={text} className={styles["line"]}>
          {text}
        </p>
      ))}
    </div>
  );
}
