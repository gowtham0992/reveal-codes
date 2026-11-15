import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../fixtures");

function listFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const full = path.join(dir, d.name);
    return d.isDirectory() ? listFiles(full) : [full];
  });
}

const CREDENTIAL_VALUE = /\b(?:Token|Bearer) +[^\s"',;]+/;
const AUTHORIZATION = /authorization/i;

/** Returns the reasons a fixture text looks like it holds a credential. */
function credentialFindings(text: string): string[] {
  const found: string[] = [];
  if (CREDENTIAL_VALUE.test(text)) found.push("Token/Bearer credential value");
  if (AUTHORIZATION.test(text)) found.push("authorization");
  return found;
}

describe("fixture credential scan  _Requirements: 11.3_", () => {
  it("finds the planted credential forms", () => {
    expect(credentialFindings('{"Authorization":"Token abc123"}')).toEqual([
      "Token/Bearer credential value",
      "authorization",
    ]);
    expect(credentialFindings("Bearer eyJhbGciOi")).toEqual(["Token/Bearer credential value"]);
    expect(credentialFindings("AUTHORIZATION header")).toEqual(["authorization"]);
    expect(credentialFindings("plain opinion text")).toEqual([]);
  });

  it("scans at least one fixture file", () => {
    expect(listFiles(DIR).length).toBeGreaterThan(0);
  });

  it("no file under fixtures/ holds a credential or the word authorization", () => {
    const offenders = listFiles(DIR).flatMap((file) =>
      credentialFindings(readFileSync(file, "utf8")).map(
        (why) => `${path.relative(DIR, file)}: ${why}`,
      ),
    );
    expect(offenders).toEqual([]);
  });
});
