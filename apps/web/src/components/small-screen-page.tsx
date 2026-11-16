import type { OrderEntry } from "@reveal-codes/export";
import { optionText } from "../order-copy";
import { NO_LINKS } from "../public-links";
import type { PublicLinks } from "../public-links";
import { Mark } from "./mark";
import styles from "./small-screen-page.module.css";

export const VIDEO_LINK_TEXT = "Watch the two-minute demo";
export const REPO_LINK_TEXT = "Source code";

export const SMALL_SCREEN_SENTENCES = [
  "Reveal Codes is a drafting editor for court filings that shows where each sentence came from and checks each citation.",
  "It is a desktop editor.",
  "It needs a screen at least 1150 pixels wide.",
] as const;

function Link({ href, text }: Readonly<{ href: string; text: string }>) {
  return (
    <a href={href} target="_blank" rel="noreferrer">
      {text}
    </a>
  );
}

/** Shown instead of the shell below NARROW_WIDTH: text, and the two links when they are set. */
export function SmallScreenPage({
  links = NO_LINKS,
  selection = null,
}: Readonly<{ links?: PublicLinks; selection?: OrderEntry | null }>) {
  return (
    <main className={styles["page"]}>
      <title>Reveal Codes</title>
      <div className={styles["wordmark"]}>
        <Mark />
        Reveal Codes
      </div>
      {SMALL_SCREEN_SENTENCES.map((sentence) => (
        <p key={sentence}>{sentence}</p>
      ))}
      {selection === null ? null : (
        <p>{`Selected: ${selection.court.abbreviation}, ${optionText(selection)}. Open this page on a wider screen to draft under it.`}</p>
      )}
      {links.video === null && links.repo === null ? null : (
        <div className={styles["links"]}>
          {links.video === null ? null : <Link href={links.video} text={VIDEO_LINK_TEXT} />}
          {links.repo === null ? null : <Link href={links.repo} text={REPO_LINK_TEXT} />}
        </div>
      )}
    </main>
  );
}
