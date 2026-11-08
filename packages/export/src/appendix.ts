// The Provenance Appendix: the full Reveal Codes serialisation, line by line, unmodified.
import { render } from "@reveal-codes/engine";
import type { Document } from "@reveal-codes/engine";
import type { Appendix } from "./types.js";
import { APPENDIX_INTRO_1, APPENDIX_INTRO_2, APPENDIX_TITLE } from "./wording.js";

export function buildAppendix(document: Document): Appendix {
  return {
    title: APPENDIX_TITLE,
    intro: [APPENDIX_INTRO_1, APPENDIX_INTRO_2],
    lines: render(document, "full").text.split("\n"),
  };
}
