import { err, ok, segment } from "@reveal-codes/engine";
import type { Document, EngineError, Result } from "@reveal-codes/engine";
import { aiPassages } from "./ai-paragraphs.js";
import {
  citationsOf,
  countCharacters,
  countSentences,
  overridesOf,
  quotesOf,
  toolsOf,
  usedAi,
} from "./statement-parts.js";
import { needsConfidentiality } from "./order-rules.js";
import type { OrderContext } from "./orders-types.js";
import { orderOf } from "./statement-order.js";
import { captionOf } from "./text.js";
import { isInstant, localDate } from "./time.js";
import type { Meta, RunInfo, Statement } from "./types.js";

/**
 * Error kind used for a bad `meta`: the Engine's own `invalid_timestamp`, so the
 * export package needs no error union of its own.
 */
function invalidTimestamp(value: unknown): Result<never, EngineError> {
  return err({ kind: "invalid_timestamp", value });
}

function validMeta(meta: Meta): Result<null, EngineError> {
  if (!(meta.now instanceof Date) || Number.isNaN(meta.now.getTime())) {
    return invalidTimestamp(meta.now);
  }
  if (meta.verifiedAt !== null && !isInstant(meta.verifiedAt)) {
    return invalidTimestamp(meta.verifiedAt);
  }
  return ok(null);
}

/** The author's tick counts only when the order asks for it and AI text is present. */
function certified(document: Document, ctx: OrderContext): boolean {
  return ctx !== null && ctx.confidentialityCertified && needsConfidentiality(document, ctx.entry);
}

/**
 * Builds the Statement data from the Document alone. Reads no clock: `meta` is
 * the only source of time. Does not apply the export gate.
 */
export function buildStatement(
  document: Document,
  runLog: readonly RunInfo[],
  meta: Meta,
  orderContext: OrderContext = null,
): Result<Statement, EngineError> {
  const checked = validMeta(meta);
  if (!checked.ok) return checked;
  const sentences = segment(document.text, document.spans);
  if (!sentences.ok) return sentences;
  return ok({
    order: orderOf(orderContext),
    aiPassages: aiPassages(document),
    runCount: runLog.length,
    confidentialityCertified: certified(document, orderContext),
    aiUsed: usedAi(document),
    tools: toolsOf(document, runLog),
    characters: countCharacters(document),
    sentences: countSentences(sentences.value),
    citations: citationsOf(document),
    quotes: quotesOf(document),
    overrides: overridesOf(document),
    generatedAt: meta.now.toISOString(),
    generatedDate: localDate(meta.now),
    verifiedAt: meta.verifiedAt,
    verifiedDate: meta.verifiedAt === null ? null : localDate(new Date(meta.verifiedAt)),
    caption: captionOf(document),
  });
}
