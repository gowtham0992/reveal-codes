import type { Metadata } from "next";
import { CheckPage } from "../../src/check/check-page";
import styles from "./check.module.css";

export const metadata: Metadata = {
  title: "Check the citations in a draft — Reveal Codes",
  description:
    "Paste a draft or open a file and see which citations and quotations can be found on CourtListener and which cannot. Nothing is saved.",
};

export default function Page() {
  return <CheckPage styles={styles} />;
}
