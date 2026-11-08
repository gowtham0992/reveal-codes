const INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/;

/** True for an ISO 8601 UTC instant such as `2026-03-05T02:30:00.000Z`. */
export function isInstant(value: string): boolean {
  return INSTANT.test(value) && !Number.isNaN(new Date(value).getTime());
}

function pad(n: number, width: number): string {
  return String(n).padStart(width, "0");
}

/** Local date and time `YYYY-MM-DD HH:MM` (24-hour) of `d` in the host time zone. */
export function localDateTime(d: Date): string {
  return `${localDate(d)} ${pad(d.getHours(), 2)}:${pad(d.getMinutes(), 2)}`;
}

/** Local calendar date `YYYY-MM-DD` of `d` in the host time zone. */
export function localDate(d: Date): string {
  return `${pad(d.getFullYear(), 4)}-${pad(d.getMonth() + 1, 2)}-${pad(d.getDate(), 2)}`;
}
