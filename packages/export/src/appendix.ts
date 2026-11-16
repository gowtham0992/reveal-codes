// The Provenance Appendix: the full Reveal Codes serialisation, line by line, unmodified.
import { renderRecord } from "@reveal-codes/engine";
import type { Declaration, Document } from "@reveal-codes/engine";
import type { Appendix } from "./types.js";
import { APPENDIX_INTRO_1, APPENDIX_INTRO_2, APPENDIX_TITLE } from "./wording.js";

/** The full record, with the Declaration in the [DOC] line when one is given. */
export function buildAppendix(
  document: Document,
  declaration: Declaration | null = null,
): Appendix {
  return {
    title: APPENDIX_TITLE,
    intro: [APPENDIX_INTRO_1, APPENDIX_INTRO_2],
    lines: renderRecord(document, declaration, "full").text.split("\n"),
  };
}
