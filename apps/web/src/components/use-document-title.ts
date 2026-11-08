const MAX_CAPTION = 60;
const SUFFIX = "Reveal Codes";

/** First non-blank line, trimmed, at most 60 UTF-16 code units; null when none. */
export function captionOf(text: string): string | null {
  const match = /\S[^\n]*/.exec(text);
  if (match === null) return null;
  return match[0].trim().slice(0, MAX_CAPTION);
}

/** The Window_Title for a Document text. */
export function windowTitle(text: string): string {
  const caption = captionOf(text);
  return caption === null ? SUFFIX : `${caption} \u2014 ${SUFFIX}`;
}
