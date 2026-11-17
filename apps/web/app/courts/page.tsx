import type { Metadata } from "next";
import { ORDERS } from "@reveal-codes/export";
import { Mark } from "../../src/components/mark";
import { CourtsBrowser } from "../../src/courts/courts-browser";
import { introText } from "../../src/courts/intro";
import { buildCourtsModel } from "../../src/courts/view-model";
import { getPublicLinks } from "../../src/server/deps";
import styles from "./courts.module.css";

export const metadata: Metadata = {
  title: "Federal court rules on AI in filings — Reveal Codes",
  description:
    "Lists federal court rules and orders on generative AI in filings, with a link to each court's own text.",
};

export default function Page() {
  const model = buildCourtsModel(ORDERS, getPublicLinks().repo);
  const parts = introText(model.stats, model.repoLinks);
  return (
    <div className={styles["desk"]}>
      <main className={styles["page"]}>
        <header className={styles["header"]}>
          <a href="/" className={styles["brand"]}>
            <Mark />
            <span className={styles["wordmark"]}>Reveal Codes</span>
          </a>
        </header>
        <h1 className={styles["title"]}>Federal court rules on AI in filings</h1>
        <p>
          {parts.map((part, index) =>
            part.kind === "link" ? (
              <a key={index} href={part.href}>
                {part.text}
              </a>
            ) : (
              part.text
            ),
          )}
        </p>
        <p>
          This page is a snapshot and is not legal advice. Read the court&apos;s own text before
          you file.
        </p>
        <p>
          <a href="/">Open the editor</a>
        </p>
        <CourtsBrowser entries={ORDERS.entries} model={model} />
      </main>
    </div>
  );
}
