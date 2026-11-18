/** Display data for one resolved citation. Kept in memory and stored with the saved draft; never stored in the Document. */
export type DisplayInfo = Readonly<{
  clusterId: string;
  foundName: string;
  foundYear?: number;
  absoluteUrl?: string;
}>;

export const COURTLISTENER_ORIGIN = "https://www.courtlistener.com";

/** A site-relative path: begins with a single `/`. */
export function isSafeAbsoluteUrl(v: unknown): v is string {
  return typeof v === "string" && v.startsWith("/") && !v.startsWith("//");
}

function isRecordLike(v: unknown): v is Readonly<Record<string, unknown>> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function isDisplayInfo(v: unknown): v is DisplayInfo {
  if (!isRecordLike(v)) return false;
  if (typeof v["clusterId"] !== "string" || v["clusterId"] === "") return false;
  if (typeof v["foundName"] !== "string" || v["foundName"] === "") return false;
  const year = v["foundYear"];
  if (year !== undefined && !(Number.isInteger(year) && (year as number) >= 1000)) return false;
  const url = v["absoluteUrl"];
  return url === undefined || isSafeAbsoluteUrl(url);
}

/** The link target, or null when `clusterId` is not a string of ASCII digits. */
export function courtListenerLink(clusterId: string, absoluteUrl?: string): string | null {
  if (!/^[0-9]+$/.test(clusterId)) return null;
  if (isSafeAbsoluteUrl(absoluteUrl)) return `${COURTLISTENER_ORIGIN}${absoluteUrl}`;
  return `${COURTLISTENER_ORIGIN}/opinion/${clusterId}/x/`;
}
