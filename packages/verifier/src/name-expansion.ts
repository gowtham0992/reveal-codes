// Tables for the case-name rule (case-match design, "Verifier: name matching").
// Every key is punctuation-free and lower-case. No key stands for two words.

export const NAME_EXPANSION_TABLE: Readonly<Record<string, readonly string[]>> = {
  dept: ["department"],
  us: ["united", "states"],
  commr: ["commissioner"],
  govt: ["government"],
  bd: ["board"],
  educ: ["education"],
  ins: ["insurance"],
  mfg: ["manufacturing"],
  sch: ["school"],
  ry: ["railway"],
  rr: ["railroad"],
  hous: ["housing"],
  fedn: ["federation"],
  socy: ["society"],
  ctr: ["center"],
  sys: ["system"],
  servs: ["services"],
  mgmt: ["management"],
  assn: ["association"],
  intl: ["international"],
  natl: ["national"],
  bros: ["brothers"],
  univ: ["university"],
  hosp: ["hospital"],
  auth: ["authority"],
  cnty: ["county"],
  commn: ["commission"],
  props: ["properties"],
  cos: ["companies"],
  assocs: ["associates"],
};

export const DROPPED_WORDS: ReadonlySet<string> = new Set([
  "v",
  "vs",
  "in",
  "re",
  "the",
  "of",
  "and",
  "et",
  "al",
  "ex",
  "rel",
  "inc",
  "co",
  "corp",
  "corporation",
  "company",
  "llc",
  "ltd",
  "lp",
  "llp",
  "plc",
  "na",
]);

export const INITIALS_SKIP_WORDS: ReadonlySet<string> = new Set(["of", "and", "the", "for"]);

export function hasExpansion(word: string): boolean {
  return Object.prototype.hasOwnProperty.call(NAME_EXPANSION_TABLE, word);
}
