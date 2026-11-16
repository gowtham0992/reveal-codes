import type { OrderStats } from "@reveal-codes/export";
import type { RepoLinks } from "./view-model";

export type IntroPart =
  Readonly<{ kind: "text"; text: string }> | Readonly<{ kind: "link"; text: string; href: string }>;

function text(value: string): IntroPart {
  return { kind: "text", text: value };
}

function link(value: string, href: string): IntroPart {
  return { kind: "link", text: value, href };
}

/** The introductory paragraph as text and link parts. Every figure comes from `stats`. */
export function introText(stats: OrderStats, repoLinks: RepoLinks | null): readonly IntroPart[] {
  const head =
    `This page lists ${String(stats.total)} court rules and orders on generative AI in filings, ` +
    `from ${String(stats.courts)} courts. ${String(stats.inForce)} are in force. ` +
    `The list was compiled on ${stats.compiled}. ` +
    "Each instrument was read from the court's own text, and the data is released under CC0.";
  if (repoLinks === null) return [text(head)];
  return [
    text(`${head} Read the `),
    link("data file", repoLinks.dataset),
    text(" and its "),
    link("README", repoLinks.readme),
    text("."),
  ];
}
