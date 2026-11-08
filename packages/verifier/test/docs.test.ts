import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

function read(rel: string): string {
  return readFileSync(path.join(ROOT, rel), "utf8");
}

function envLines(): readonly string[] {
  return read(".env.example").split("\n");
}

function lineIndex(name: string): number {
  return envLines().findIndex((l) => l.startsWith(`${name}=`));
}

describe("documentation _Requirements: 2.11, 15.7, 17.1, 17.2, 17.3, 17.4_", () => {
  it("README has the section 'What leaves your machine' with the privacy statements", () => {
    const readme = read("README.md");
    const at = readme.indexOf("\n## What leaves your machine\n");
    expect(at).toBeGreaterThanOrEqual(0);
    const rest = readme.slice(at + 1);
    const next = rest.indexOf("\n## ", 1);
    const section = next < 0 ? rest : rest.slice(0, next);
    expect(section).toContain("only citation strings go to CourtListener");
    expect(section).toContain("Nothing is sent to a provider unless you use Draft");
    expect(section).toContain("no telemetry");
  });

  it("citations.md states newline joining and one request per chunk, and no whole-document request", () => {
    const text = read(".kiro/steering/citations.md");
    expect(text).toContain("joined by newline");
    expect(text).toContain("one `citation-lookup` request per chunk");
    expect(text).not.toMatch(/one `citation-lookup` request per verify action/);
    expect(text).not.toMatch(/for the whole document/i);
    expect(text).not.toMatch(/`lookup\(documentText\)`/);
    const sentences = text.split(/(?<=[.;])\s+/);
    const offending = sentences.filter(
      (s) => /whole document/i.test(s) && !/never sends the whole document/i.test(s),
    );
    expect(offending).toEqual([]);
  });

  it(".env.example lists the new variables each directly after a comment line", () => {
    const lines = envLines();
    for (const name of ["REVEAL_CODES_CACHE_DIR", "REVEAL_CODES_FIXTURES_ONLY"]) {
      const i = lineIndex(name);
      expect(i).toBeGreaterThan(0);
      expect(lines[i - 1]?.startsWith("# ")).toBe(true);
    }
  });

  it(".env.example token comment says the token is read only by the MCP server and the web app", () => {
    const i = lineIndex("COURTLISTENER_TOKEN");
    expect(i).toBeGreaterThan(0);
    expect(envLines()[i - 1]).toBe(
      "# Never sent to the browser. Read by the MCP server and the web app.",
    );
  });

  it("BUILD_LOG.md has an entry headed with a date and citation-verifier", () => {
    expect(read("BUILD_LOG.md")).toMatch(/^## \d{4}-\d{2}-\d{2} citation-verifier$/m);
  });
});
