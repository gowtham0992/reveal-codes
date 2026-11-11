import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  WEB_ROOT,
  formatViolations,
  importsOf,
  lineOfIndex,
  readSources,
  violation,
  walkFiles,
  type SourceText,
  type Violation,
} from "../support/scan";

const THIRD_PARTY_HOSTS = /fonts\.googleapis\.com|fonts\.gstatic\.com/g;
const REMOTE_URL = /url\(\s*["']?\s*https?:/gi;
const REMOTE_IMPORT = /@import\s+(?:url\(\s*)?["']?\s*https?:/gi;

const EXPECTED_IMPORTS = [
  "@fontsource/public-sans/latin-500.css",
  "@fontsource/public-sans/latin-600.css",
  "@fontsource/public-sans/latin-700.css",
  "@fontsource/libre-caslon-text/latin-400.css",
  "@fontsource/libre-caslon-text/latin-400-italic.css",
  "@fontsource/ibm-plex-mono/latin-400.css",
  "@fontsource/ibm-plex-mono/latin-600.css",
  "@fontsource/ibm-plex-mono/latin-700.css",
];

/** Reports a third-party font host, or an http(s) `url()` or `@import`, with path and line. */
function fontHostViolations(file: SourceText): Violation[] {
  const rules: [RegExp, string][] = [
    [THIRD_PARTY_HOSTS, "names a third-party font host"],
    [REMOTE_URL, "has a url() that names an http(s) address"],
    [REMOTE_IMPORT, "has an @import that names an http(s) address"],
  ];
  return rules.flatMap(([pattern, message]) =>
    [...file.text.matchAll(pattern)].map((m) =>
      violation(file.path, lineOfIndex(file.text, m.index), message),
    ),
  );
}

function layoutFile(): SourceText {
  const path = "app/layout.tsx";
  return { path, text: readFileSync(join(WEB_ROOT, path), "utf8") };
}

function fontsourceImports(file: SourceText): string[] {
  return importsOf(file)
    .map((ref) => ref.spec)
    .filter((spec) => spec.startsWith("@fontsource"));
}

function importedFontSheets(): SourceText[] {
  return fontsourceImports(layoutFile()).flatMap((spec) => {
    const full = join(WEB_ROOT, "node_modules", spec);
    return existsSync(full) ? [{ path: spec, text: readFileSync(full, "utf8") }] : [];
  });
}

function builtSheets(): SourceText[] {
  return walkFiles(join(WEB_ROOT, ".next/static/css"), /\.css$/).map((full) => ({
    path: full.slice(WEB_ROOT.length),
    text: readFileSync(full, "utf8"),
  }));
}

describe("third-party font scan _Requirements: 2.2, 2.3, 2.4_", () => {
  it("finds no third-party font host or remote url()/@import in any stylesheet", () => {
    const sheets = [
      ...readSources(["app", "src"], /\.css$/),
      ...importedFontSheets(),
      ...builtSheets(),
    ];
    expect(formatViolations(sheets.flatMap(fontHostViolations))).toEqual([]);
  });

  it("reads all eight imported @fontsource stylesheets", () => {
    expect(importedFontSheets().map((s) => s.path)).toEqual(EXPECTED_IMPORTS);
  });

  it("reports a Google Fonts host with its line", () => {
    const text = "a { }\n@font-face { src: local(x); } /* fonts.gstatic.com */";
    expect(formatViolations(fontHostViolations({ path: "x.css", text }))).toEqual([
      "x.css:2 names a third-party font host",
    ]);
  });

  it("reports an https url() and an http url()", () => {
    const text =
      '@font-face { src: url("https://example.com/a.woff2"); }\nb { src: url(http://e.org/b) }';
    expect(formatViolations(fontHostViolations({ path: "y.css", text }))).toEqual([
      "y.css:1 has a url() that names an http(s) address",
      "y.css:2 has a url() that names an http(s) address",
    ]);
  });

  it("reports an @import of an http(s) address in both forms", () => {
    const text = '@import "https://example.com/a.css";\n@import url(http://e.org/b.css);';
    const found = formatViolations(fontHostViolations({ path: "z.css", text }));
    expect(found).toContain("z.css:1 has an @import that names an http(s) address");
    expect(found).toContain("z.css:2 has an @import that names an http(s) address");
  });

  it("accepts relative url() and local @import", () => {
    const text = '@font-face { src: url(./files/a.woff2) format("woff2"); }\n@import "./b.css";';
    expect(fontHostViolations({ path: "ok.css", text })).toEqual([]);
  });
});

describe("layout font imports _Requirements: 2.1, 2.13_", () => {
  it("imports exactly the eight @fontsource files, in order", () => {
    expect(fontsourceImports(layoutFile())).toEqual(EXPECTED_IMPORTS);
  });

  it("imports the fonts before ./globals.css", () => {
    const specs = importsOf(layoutFile()).map((ref) => ref.spec);
    expect(specs.indexOf("./globals.css")).toBe(specs.length - 1);
    expect(specs.indexOf(EXPECTED_IMPORTS[7] ?? "")).toBeLessThan(specs.indexOf("./globals.css"));
  });

  it("detects a ninth @fontsource import", () => {
    const text = `${layoutFile().text}\nimport "@fontsource/public-sans/latin-400.css";`;
    expect(fontsourceImports({ path: "app/layout.tsx", text })).toHaveLength(9);
  });
});
