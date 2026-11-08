import styles from "./issues-region.module.css";

export const DEMO_MODE_LINE =
  "Demo mode checks only the recorded demo citations. Any other citation shows as not found.";

export type IssuesRegionProps = Readonly<{ demoMode?: boolean }>;

/** Placeholder for the Issues list (task 7.1); shows the Fixtures_Mode line of Requirement 15.7. */
export function IssuesRegion({ demoMode = false }: IssuesRegionProps) {
  return (
    <aside aria-labelledby="issues-heading" className={styles["issues"]}>
      <h2 id="issues-heading" className={styles["heading"]}>
        Issues
      </h2>
      {demoMode ? <p className={styles["note"]}>{DEMO_MODE_LINE}</p> : null}
    </aside>
  );
}
