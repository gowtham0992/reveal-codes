import styles from "./small-screen-page.module.css";

export const SMALL_SCREEN_SENTENCES = [
  "Reveal Codes is a drafting editor for court filings that shows where each sentence came from and checks each citation.",
  "It is a desktop editor.",
  "It needs a screen at least 1150 pixels wide.",
] as const;

/** Shown instead of the shell below NARROW_WIDTH: text only, no control. */
export function SmallScreenPage() {
  return (
    <main className={styles["page"]}>
      <title>Reveal Codes</title>
      <div className={styles["wordmark"]}>Reveal Codes</div>
      {SMALL_SCREEN_SENTENCES.map((sentence) => (
        <p key={sentence}>{sentence}</p>
      ))}
    </main>
  );
}
