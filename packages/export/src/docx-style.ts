// Fixed layout constants for the exported file (design D7): US Letter, 1-inch margins.
import { BorderStyle } from "docx";

export const BODY_FONT = "Times New Roman";
export const CODE_FONT = "Courier New";
/** Half-points: 12 pt and 9 pt. */
export const BODY_SIZE = 24;
export const CODE_SIZE = 18;
/** Twentieths of a point: double spaced for the filing, single for the Statement and Appendix. */
export const FILING_LINE = 480;
export const SINGLE_LINE = 240;

export const PAGE = {
  size: { width: 12240, height: 15840 },
  margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 },
} as const;

const EDGE = { style: BorderStyle.SINGLE, size: 4, color: "000000" } as const;

/** Single borders on all six edge kinds of a table. */
export const TABLE_BORDERS = {
  top: EDGE,
  bottom: EDGE,
  left: EDGE,
  right: EDGE,
  insideHorizontal: EDGE,
  insideVertical: EDGE,
} as const;
