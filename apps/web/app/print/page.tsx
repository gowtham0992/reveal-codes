import type { Metadata } from "next";
import { PrintView } from "../../src/components/print-view";

export const metadata: Metadata = {
  title: "Print \u2014 Reveal Codes",
};

export default function Page() {
  return <PrintView />;
}
