/**
 * The most text, in characters (code units), that the verify route and the Open flow accept.
 * The one definition. It has no imports so server and client modules can both import it.
 *
 * On the verify route the body holds the citation records and no draft text, so this bounds
 * the request the route reads, ahead of any lookup. The smaller caps there still apply:
 * 500 records is about 112 000 characters for typical records, and 262 144 bytes bounds the
 * body whatever its characters.
 */
export const MAX_TEXT_CHARS = 200_000;
