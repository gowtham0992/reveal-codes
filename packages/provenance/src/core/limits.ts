/** Size_Limit: UTF-16 code units of decoded text per file (Req 5.10, Decision 11). */
export const SIZE_LIMIT = 200_000;
/** Hook_Deadline: wall-clock milliseconds for one Recorder run (Req 4.13, Req 7.10). */
export const HOOK_DEADLINE_MS = 20_000;
/** A window idle for 12 hours is stale and swept (Req 3, stale-window criterion). */
export const STALE_WINDOW_MS = 43_200_000;
/** Longest Run label title, in code points (Req 3.14, design M3). */
export const LABEL_MAX = 80;
/** Largest hook payload read from standard input, 1 MiB (Req 3.15, 3.19). */
export const STDIN_MAX = 1_048_576;
/** Longest wait for standard input, in milliseconds (Req 3.15, Decision 15). */
export const STDIN_WAIT_MS = 1_500;
/** Longest wait to take the Record_Directory lock (design, Recorder run). */
export const LOCK_WAIT_MS = 5_000;
/** Modification times closer than this to the read are racy (Req 4.12, design). */
export const RACY_MS = 2_000;
/** Myers diff stops at this edit distance and returns one Hunk (design M1, Req 4.2). */
export const DIFF_CAP = 1_500;
/** A lock older than this is stale and may be taken over (design, lock). */
export const LOCK_STALE_MS = 30_000;
