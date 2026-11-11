import styles from "./status-line.module.css";
import statusBar from "../pane/status-bar.module.css";

export type StatusLineProps = Readonly<{
  /** Position_Text from `positionText()`. */
  position: string;
  /** Mode_Text, or null while the mode is loading. */
  mode: string | null;
}>;

/** The strip under the editor while the Pane is closed. No live region: keystrokes are not announced. */
export function StatusLine({ position, mode }: StatusLineProps) {
  return (
    <section
      role="region"
      aria-label="Status line"
      className={[styles["statusLine"], statusBar["bar"]].join(" ")}
    >
      <span className={styles["position"]}>{position}</span>
      <span className={statusBar["mode"]}>{mode}</span>
      <span className={styles["legend"]}>
        <strong className={statusBar["key"]}>Alt-F3</strong>
        {" Codes   "}
        <strong className={statusBar["key"]}>F7</strong>
        {" Exit"}
      </span>
    </section>
  );
}
