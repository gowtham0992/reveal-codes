import { orderSentences } from "./render-order.js";
import { percent } from "./text.js";
import type { Statement } from "./types.js";
import {
  declarationAi,
  declarationNone,
  pastedAfterAssistantSentence,
  typedAndPastedSentence,
  typedOnlySentence,
} from "./declaration-wording.js";
import { aiParagraph } from "./wording.js";

function total(s: Statement): number {
  const c = s.characters;
  return c.HUM + c.PST + c.AI + c["AI>HUM"];
}

function assistantSentence(s: Statement): string {
  const c = s.characters;
  const ai = c.AI + c["AI>HUM"];
  return aiParagraph({
    tools: s.tools,
    ai,
    total: total(s),
    percent: percent(ai, total(s)),
    edited: c["AI>HUM"],
  });
}

/** Record sentences, chosen by (assistant text present, pasted characters above 0). */
function recordSentences(s: Statement): string[] {
  const pasted = s.characters.PST;
  const all = total(s);
  if (s.assistantText) {
    const head = assistantSentence(s);
    if (pasted === 0) return [head];
    const figures = { total: all, pasted, pastedPct: percent(pasted, all) };
    return [head, pastedAfterAssistantSentence(figures)];
  }
  if (pasted === 0) return [typedOnlySentence];
  const typed = s.characters.HUM;
  return [
    typedAndPastedSentence({
      total: all,
      typed,
      typedPct: percent(typed, all),
      pasted,
      pastedPct: percent(pasted, all),
    }),
  ];
}

/** The author's Declaration sentence; none when no Declaration applies. */
function declarationSentences(s: Statement): string[] {
  const d = s.declaration;
  if (d === null) return [];
  return [d.choice === "none" ? declarationNone(d.subject) : declarationAi(d.subject, d.toolName)];
}

/** Paragraph 2: record sentences, then the Declaration sentence, then the order sentences. */
export function paragraphTwo(s: Statement): string {
  return [...recordSentences(s), ...declarationSentences(s), ...orderSentences(s)].join(" ");
}
