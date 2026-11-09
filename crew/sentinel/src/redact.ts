/** Replaces every occurrence of a non-empty token with [redacted]; text unchanged when token is absent or empty. */
export function redact(text: string, token: string | null | undefined): string {
  if (token === null || token === undefined || token === "") return text;
  return text.split(token).join("[redacted]");
}
