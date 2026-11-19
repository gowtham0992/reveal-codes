/** A file on one side of a rename search: its path and the SHA-256 digest of its text. */
export type DigestedPath = { path: string; digest: string };

/** One rename: the file that is gone and the file that appeared with the same text. */
export type RenamePair = { from: string; to: string };

/** SHA-256 of zero bytes. An empty file is never paired (Req 5.11). */
export const EMPTY_SHA256 = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

function countByDigest(files: readonly DigestedPath[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const file of files) counts.set(file.digest, (counts.get(file.digest) ?? 0) + 1);
  return counts;
}

function isPairable(digest: string): boolean {
  return digest !== "" && digest !== EMPTY_SHA256;
}

/**
 * Pairs a gone path with an appeared path only when exactly one of each carries the same
 * non-empty digest (Req 5.11, 5.12). A rename plus an edit has no equal digest, and a digest
 * that matches several gone or several appeared files pairs none of them, so those stay a
 * deletion and a creation (Req 5.13). Pairs follow the order of `gone`.
 */
export function pairRenames(
  gone: readonly DigestedPath[],
  appeared: readonly DigestedPath[],
): RenamePair[] {
  const goneCounts = countByDigest(gone);
  const appearedCounts = countByDigest(appeared);
  const target = new Map<string, string>();
  for (const file of appeared) target.set(file.digest, file.path);
  const pairs: RenamePair[] = [];
  for (const file of gone) {
    const to = target.get(file.digest);
    const unique = goneCounts.get(file.digest) === 1 && appearedCounts.get(file.digest) === 1;
    if (to !== undefined && isPairable(file.digest) && unique) pairs.push({ from: file.path, to });
  }
  return pairs;
}
