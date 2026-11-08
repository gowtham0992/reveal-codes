import type { VerificationResult } from "@reveal-codes/engine";

type Verified = Extract<VerificationResult, { status: "verified" }>;
type Ambiguous = Extract<VerificationResult, { status: "ambiguous" }>;
type Unchecked = Extract<VerificationResult, { status: "unchecked" }>;
type NotFound = Extract<VerificationResult, { status: "not_found" }>;

const UNCHECKED: VerificationResult = { status: "unchecked" };

function distinct(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function ofStatus<S extends VerificationResult["status"]>(
  members: readonly VerificationResult[],
  status: S,
): Extract<VerificationResult, { status: S }>[] {
  return members.filter(
    (m): m is Extract<VerificationResult, { status: S }> => m.status === status,
  );
}

function fromVerified(verified: readonly Verified[]): VerificationResult {
  const ids = distinct(verified.map((v) => v.clusterId));
  const [first] = ids;
  if (ids.length === 1 && first !== undefined) return { status: "verified", clusterId: first };
  return { status: "ambiguous", candidates: ids };
}

function fromUnchecked(unchecked: readonly Unchecked[]): VerificationResult {
  let latest: string | undefined;
  for (const u of unchecked) {
    if (u.waitUntil === undefined) continue;
    if (latest === undefined || Date.parse(u.waitUntil) > Date.parse(latest)) latest = u.waitUntil;
  }
  return latest === undefined ? UNCHECKED : { status: "unchecked", waitUntil: latest };
}

function fromNotFound(members: readonly NotFound[]): VerificationResult {
  const [first] = members;
  const reason = first?.reason;
  const same = reason !== undefined && members.every((m) => m.reason === reason);
  return same ? { status: "not_found", reason } : { status: "not_found" };
}

/**
 * One result for a parallel citation (design A6, Req 6). The first matching row wins;
 * rows 1 and 2 ignore every non-verified member.
 */
export function combineParallel(members: readonly VerificationResult[]): VerificationResult {
  if (members.length === 0) return UNCHECKED;
  const verified = ofStatus(members, "verified");
  if (verified.length > 0) return fromVerified(verified);
  const ambiguous: readonly Ambiguous[] = ofStatus(members, "ambiguous");
  if (ambiguous.length > 0) {
    return { status: "ambiguous", candidates: distinct(ambiguous.flatMap((a) => a.candidates)) };
  }
  const unchecked = ofStatus(members, "unchecked");
  if (unchecked.length > 0) return fromUnchecked(unchecked);
  return fromNotFound(ofStatus(members, "not_found"));
}
