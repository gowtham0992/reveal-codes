import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import {
  WEB_ROOT,
  collect,
  formatViolations,
  importsOf,
  lineOfNode,
  parseSource,
  readSources,
  violation,
} from "../support/scan";
import type { SourceText, Violation } from "../support/scan";

/** The modules of the Open flow: the pure client modules, the Picker, the drop and the wiring. */
const OPEN_MODULE =
  /^src\/(?:client\/(?:open-[a-z-]+|pasted-document)|components\/(?:use-open[a-z-]*|use-file-drop))\.tsx?$/;
const NETWORK_NAMES = new Set(["FormData", "XMLHttpRequest", "fetch", "sendBeacon", "WebSocket"]);

function openModules(): SourceText[] {
  return readSources(["src"]).filter((f) => OPEN_MODULE.test(f.path));
}

/** Requirement 17: the open modules hold no upload code. */
function uploadViolations(file: SourceText): Violation[] {
  const sf = parseSource(file);
  return collect(sf, ts.isIdentifier)
    .filter((n) => NETWORK_NAMES.has(n.text))
    .map((n) => violation(file.path, lineOfNode(sf, n), `network name ${n.text}`));
}

function mentions(node: ts.Node, text: string): boolean {
  if (ts.isIdentifier(node) && node.text === text) return true;
  return ts.forEachChild(node, (child) => (mentions(child, text) ? true : undefined)) ?? false;
}

/** A `catch` that never reads its variable discards the error (a catch that returns or reports it uses it). */
function discardingCatches(file: SourceText): Violation[] {
  const sf = parseSource(file);
  return collect(sf, ts.isCatchClause)
    .filter((c) => {
      const name = c.variableDeclaration?.name;
      if (name === undefined || !ts.isIdentifier(name)) return true;
      return !mentions(c.block, name.text);
    })
    .map((c) => violation(file.path, lineOfNode(sf, c), "catch discards the error"));
}

function routeFiles(dir: string): string[] {
  return existsSync(dir)
    ? readdirSync(dir, { recursive: true, withFileTypes: true })
        .filter((e) => e.isFile())
        .map((e) => join(e.parentPath, e.name))
    : [];
}

describe("static: the Open flow _Requirements: 17.1, 17.2, 17.4, 21.8_", () => {
  it("finds the open modules", () => {
    const paths = openModules().map((f) => f.path);
    for (const expected of [
      "src/client/open-file.ts",
      "src/client/open-outcome.ts",
      "src/components/use-open.ts",
      "src/components/use-open-draft.tsx",
      "src/components/use-file-drop.ts",
    ]) {
      expect(paths).toContain(expected);
    }
  });

  it("holds no upload code: no FormData, XMLHttpRequest, fetch or sendBeacon", () => {
    expect(formatViolations(openModules().flatMap(uploadViolations))).toEqual([]);
  });

  it("holds no catch that discards an error", () => {
    expect(formatViolations(openModules().flatMap(discardingCatches))).toEqual([]);
  });

  it("adds no server route for opening: app/api holds only the existing routes", () => {
    const routes = routeFiles(join(WEB_ROOT, "app", "api"))
      .map((p) =>
        p
          .slice(join(WEB_ROOT, "app", "api").length + 1)
          .split("\\")
          .join("/"),
      )
      .sort();
    const names = new Set(routes.map((r) => r.split("/")[0]));
    expect([...names].sort()).toEqual(["assistant", "mode", "opinion", "verify"]);
    expect(routes.filter((r) => /open|upload|import/i.test(r))).toEqual([]);
  });

  it("lets a client module import limits.ts: open-outcome imports MAX_TEXT_CHARS from ../limits", () => {
    const outcome = openModules().find((f) => f.path === "src/client/open-outcome.ts");
    if (outcome === undefined) throw new Error("open-outcome.ts not found");
    const refs = importsOf(outcome).filter((r) => r.spec === "../limits");
    expect(refs).toHaveLength(1);
    expect(outcome.text).toMatch(/import \{[^}]*\bMAX_TEXT_CHARS\b[^}]*\} from "\.\.\/limits"/);
    expect(existsSync(join(WEB_ROOT, "src", "limits.ts"))).toBe(true);
  });
});

describe("static: the Open flow scans (planted violations)", () => {
  it("reports upload code with path and line", () => {
    const text = "const a = 1;\nconst f = new FormData();\nawait fetch('/x');\n";
    expect(formatViolations(uploadViolations({ path: "src/client/open-x.ts", text }))).toEqual([
      "src/client/open-x.ts:2 network name FormData",
      "src/client/open-x.ts:3 network name fetch",
    ]);
  });

  it("reports an empty catch and an unused catch variable, not a catch that uses it", () => {
    const text = [
      "try { a(); } catch {}",
      "try { a(); } catch (e) { b(); }",
      "try { a(); } catch (cause) { return { ok: false, cause }; }",
    ].join("\n");
    expect(formatViolations(discardingCatches({ path: "src/client/open-x.ts", text }))).toEqual([
      "src/client/open-x.ts:1 catch discards the error",
      "src/client/open-x.ts:2 catch discards the error",
    ]);
  });
});
