import type { ResolvedRow } from "../client/resolved";
import { CourtListenerLink } from "./courtlistener-link";
import { shorten } from "./issues-list";
import styles from "./resolved-list.module.css";

export const RESOLVED_HEADING = "Resolved citations";

/** The non-blocking Resolved_List: no Override, no Go. Renders nothing without rows. */
export function ResolvedList({ rows }: Readonly<{ rows: readonly ResolvedRow[] | null }>) {
  if (rows === null || rows.length === 0) return null;
  return (
    <section aria-labelledby="resolved-heading">
      <h3 id="resolved-heading" className={`small-label ${styles["heading"] ?? ""}`}>
        {RESOLVED_HEADING}
      </h3>
      <ul className={styles["list"]}>
        {rows.map((row) => (
          <li key={row.key} className={styles["row"]}>
            <p className={styles["text"]}>{shorten(row.text)}</p>
            {row.found === null ? null : <p className={styles["text"]}>{row.found}</p>}
            <p className={styles["text"]}>
              <CourtListenerLink href={row.href} />
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
