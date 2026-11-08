import styles from "./status-line.module.css";

/** Three spaces between the two entries. */
export const KEY_LEGEND = "Alt-F3 Codes   F7 Exit";

export type StatusLineProps = Readonly<{
  /** Position_Text from `positionText()`. */
  position: string;
  /** Mode_Text, or null while the mode is loading. */
  mode: string | null;
}>;

/** The strip under the editor while the Pane is closed. No live region: keystrokes are not announced. */
export function StatusLine({ position, mode }: StatusLineProps) {
  return (
    <section role="region" aria-label="Status line" className={styles["statusLine"]}>
      <span className={styles["position"]}>{position}</span>
      <span className={styles["mode"]}>{mode}</span>
      <span className={styles["legend"]}>{KEY_LEGEND}</span>
    </section>
  );
}
