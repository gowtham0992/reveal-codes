/** Where the small-screen page may point: a demo video and the source. Both are public, build-time values. */
export type PublicLinks = Readonly<{ video: string | null; repo: string | null }>;

export const NO_LINKS: PublicLinks = { video: null, repo: null };

/** A web address that is safe to put in an `href`: http or https only, else null. */
function webAddress(value: string | undefined): string | null {
  const text = (value ?? "").trim();
  if (text === "") return null;
  const parsed = URL.canParse(text) ? new URL(text) : null;
  return parsed?.protocol === "https:" || parsed?.protocol === "http:" ? text : null;
}

/** Pure: each address is kept only if it is an http(s) address, else null. */
export function parsePublicLinks(video: string | undefined, repo: string | undefined): PublicLinks {
  return { video: webAddress(video), repo: webAddress(repo) };
}
