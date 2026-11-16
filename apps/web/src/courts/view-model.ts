import { orderStats } from "@reveal-codes/export";
import type { OrderDataset, OrderStats, OrderVocabulary } from "@reveal-codes/export";

export type RepoLinks = Readonly<{ dataset: string; readme: string }>;

export type CourtsModel = Readonly<{
  stats: OrderStats;
  repoLinks: RepoLinks | null;
  inactiveIds: readonly string[];
  words: Readonly<{
    status: OrderVocabulary["status"];
    elements: OrderVocabulary["elements"];
  }>;
  titles: Readonly<Record<string, string>>;
}>;

function buildRepoLinks(repoBase: string | null): RepoLinks | null {
  if (repoBase === null) return null;
  const base = repoBase.replace(/\/+$/, "");
  return {
    dataset: `${base}/blob/main/data/standing-orders.json`,
    readme: `${base}/blob/main/data/README.md`,
  };
}

/** Plain data the page and the browser need beyond the entries themselves. */
export function buildCourtsModel(dataset: OrderDataset, repoBase: string | null): CourtsModel {
  const titles: Record<string, string> = {};
  for (const entry of dataset.entries) {
    titles[entry.id] = entry.title === "" ? entry.instrument : entry.title;
  }
  return {
    stats: orderStats(dataset),
    repoLinks: buildRepoLinks(repoBase),
    inactiveIds: dataset.entries.filter((e) => e.status !== "current").map((e) => e.id),
    words: {
      status: dataset.vocabulary.status,
      elements: dataset.vocabulary.elements,
    },
    titles,
  };
}
