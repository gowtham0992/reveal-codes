/** Citation forms CourtListener does not resolve. Such citations are never sent (Req 5.2). */
export const UNRESOLVABLE_FORMS: readonly Readonly<{
  form: "WL" | "LEXIS";
  description: string;
}>[] = [
  {
    form: "WL",
    description:
      "Westlaw (WL) citations: CourtListener does not resolve this form, so it is not checked.",
  },
  {
    form: "LEXIS",
    description:
      "Lexis (LEXIS) citations: CourtListener does not resolve this form, so it is not checked.",
  },
];
