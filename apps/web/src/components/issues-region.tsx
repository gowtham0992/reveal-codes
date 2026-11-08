import styles from "./issues-region.module.css";

/** Placeholder for the Issues list (task 7.1). */
export function IssuesRegion() {
  return (
    <aside aria-labelledby="issues-heading" className={styles["issues"]}>
      <h2 id="issues-heading" className={styles["heading"]}>
        Issues
      </h2>
    </aside>
  );
}
