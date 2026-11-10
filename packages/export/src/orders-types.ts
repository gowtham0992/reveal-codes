// Vocabulary lists and plain-data types for the court-orders dataset. Property names keep the
// dataset's snake_case because the loader returns the data as written.
export const ORDER_KINDS = [
  "certification_every_filing",
  "disclosure_when_used",
  "prohibition",
  "verification_only",
  "guidance",
] as const;
export const APPLIES_TO = ["all", "attorneys", "pro_se"] as const;
export const ORDER_ELEMENTS = [
  "tool_name",
  "portions",
  "how_used",
  "accuracy_certification",
  "citations_verified",
  "human_review",
  "confidentiality",
  "prompt_records",
  "negative_certification_when_unused",
  "signed_by_all_drafters",
] as const;
export const CAPTION_PLACEMENTS = [
  "first_page_heading",
  "statement_title",
  "separate_declaration",
] as const;
export const ORDER_STATUSES = [
  "current",
  "superseded",
  "rescinded",
  "inactive",
  "not_adopted",
  "proposed",
] as const;

export type OrderKind = (typeof ORDER_KINDS)[number];
export type AppliesTo = (typeof APPLIES_TO)[number];
export type OrderElement = (typeof ORDER_ELEMENTS)[number];
export type CaptionPlacement = (typeof CAPTION_PLACEMENTS)[number];
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export type OrderCourt = Readonly<{ name: string; abbreviation: string; level: string }>;
export type OrderJudge = Readonly<{ name: string; role: string }>;
export type OrderCaption = Readonly<{ placement: CaptionPlacement; text: string }>;

export type OrderEntry = Readonly<{
  id: string;
  court: OrderCourt;
  judge: OrderJudge | null;
  instrument: string;
  title: string;
  date: string;
  date_note?: string;
  kind: OrderKind;
  applies_to: AppliesTo;
  elements: readonly OrderElement[];
  caption: OrderCaption | null;
  key_language: string;
  source_url: string;
  source_kind: string;
  retrieved: string;
  status: OrderStatus;
  supersedes?: string;
  superseded_by?: string;
  notes?: string;
}>;

export type OrderSet = Readonly<{ version: 1; entries: readonly OrderEntry[] }>;

/** The order chosen for a filing, with the author's confidentiality tick; `null` means none. */
export type OrderContext = Readonly<{
  entry: OrderEntry;
  confidentialityCertified: boolean;
}> | null;
