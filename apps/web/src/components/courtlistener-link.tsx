export const COURTLISTENER_LINK_TEXT = "View on CourtListener";

/** The CourtListener_Link; renders nothing when there is no safe target. */
export function CourtListenerLink({ href }: Readonly<{ href: string | null }>) {
  if (href === null) return null;
  return (
    <a href={href} target="_blank" rel="noreferrer">
      {COURTLISTENER_LINK_TEXT}
    </a>
  );
}
