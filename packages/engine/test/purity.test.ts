import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(PACKAGE_ROOT, "src");
const TESTING = path.join(SRC, "testing");
const CITATIONS = path.join(SRC, "citations");

type Scanned = { readonly code: string; readonly strings: readonly string[] };

const REGEX_PRECEDERS = "(,=:[!&|?{};+-*%<>~^";

/**
 * Token-aware scan: comments are removed, string and template literal text is
 * replaced by a `"#n"` placeholder (the text is kept in `strings`), and regex
 * literals are replaced by `/R/`. Template substitutions stay as code.
 */
export function scan(src: string): Scanned {
  const out: string[] = [];
  const strings: string[] = [];
  const templateDepths: number[] = [];
  let depth = 0;
  let i = 0;

  const lastSignificant = (): string => {
    for (let k = out.length - 1; k >= 0; k--) {
      const piece = out[k] ?? "";
      const trimmed = piece.trimEnd();
      if (trimmed.length > 0) return trimmed.slice(-1);
    }
    return "";
  };

  const pushString = (text: string): void => {
    out.push(`"#${String(strings.length)}"`);
    strings.push(text);
  };

  const readQuoted = (quote: string): void => {
    let text = "";
    i++;
    while (i < src.length && src[i] !== quote && src[i] !== "\n") {
      if (src[i] === "\\") {
        text += src[i + 1] ?? "";
        i += 2;
      } else {
        text += src[i] ?? "";
        i++;
      }
    }
    i++;
    pushString(text);
  };

  // Reads template text up to the closing backtick or a `${` substitution.
  const readTemplateText = (): void => {
    let text = "";
    while (i < src.length) {
      const ch = src[i];
      if (ch === "\\") {
        text += src[i + 1] ?? "";
        i += 2;
      } else if (ch === "`") {
        i++;
        pushString(text);
        return;
      } else if (ch === "$" && src[i + 1] === "{") {
        i += 2;
        pushString(text);
        templateDepths.push(depth);
        depth++;
        return;
      } else {
        text += ch ?? "";
        i++;
      }
    }
    pushString(text);
  };

  const readRegex = (): void => {
    i++;
    let inClass = false;
    while (i < src.length && src[i] !== "\n") {
      const ch = src[i];
      if (ch === "\\") i += 2;
      else if (ch === "[") {
        inClass = true;
        i++;
      } else if (ch === "]") {
        inClass = false;
        i++;
      } else if (ch === "/" && !inClass) break;
      else i++;
    }
    i++;
    out.push("/R/");
  };

  while (i < src.length) {
    const ch = src[i] as string;
    const next = src[i + 1];
    if (ch === "/" && next === "/") {
      while (i < src.length && src[i] !== "\n") i++;
    } else if (ch === "/" && next === "*") {
      const end = src.indexOf("*/", i + 2);
      const stop = end === -1 ? src.length : end + 2;
      out.push(src.slice(i, stop).replace(/[^\n]/g, " "));
      i = stop;
    } else if (ch === '"' || ch === "'") {
      readQuoted(ch);
    } else if (ch === "`") {
      i++;
      readTemplateText();
    } else if (
      ch === "/" &&
      (lastSignificant() === "" || REGEX_PRECEDERS.includes(lastSignificant()))
    ) {
      readRegex();
    } else {
      if (ch === "{") depth++;
      if (ch === "}") {
        depth--;
        if (templateDepths[templateDepths.length - 1] === depth) {
          templateDepths.pop();
          i++;
          readTemplateText();
          continue;
        }
      }
      out.push(ch);
      i++;
    }
  }
  return { code: out.join(""), strings };
}

function specifiersOf(scanned: Scanned): string[] {
  const found: string[] = [];
  for (const m of scanned.code.matchAll(/\b(?:from|import|require)\s*\(?\s*"#(\d+)"/g)) {
    found.push(scanned.strings[Number(m[1])] ?? "");
  }
  return found;
}

function listFiles(dir: string, ext: RegExp): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...listFiles(full, ext));
    else if (ext.test(entry.name)) files.push(full);
  }
  return files.sort();
}

const SOURCE_FILES = listFiles(SRC, /\.tsx?$/);
const rel = (file: string): string => path.relative(PACKAGE_ROOT, file);

const FORBIDDEN: readonly (readonly [string, RegExp])[] = [
  ["node: import or reference", /\bnode:/],
  ["DOM global", /(?<![.\w$])(?:window|navigator|localStorage|sessionStorage)\b/],
  // `document` is also the engine's own name for a Document value (`Applied.document`),
  // so only DOM uses of it are flagged: `typeof document` or a DOM member access.
  [
    "DOM document",
    /\btypeof\s+document\b|(?<![.\w$])document\s*\.\s*(?:body|head|cookie|documentElement|getElementById|getElementsBy\w+|querySelector(?:All)?|createElement|addEventListener|write)\b|\b(?:globalThis|self)\s*\.\s*document\b/,
  ],
  ["Date", /(?<![.\w$])Date\b/],
  ["performance", /(?<![.\w$])performance\b/],
  ["Math.random", /\bMath\s*\.\s*random\b/],
  ["crypto", /(?<![.\w$])crypto\b/],
  ["fetch", /(?<![.\w$])fetch\b/],
  ["XMLHttpRequest", /\bXMLHttpRequest\b/],
  ["setTimeout", /\bsetTimeout\b/],
  ["setInterval", /\bsetInterval\b/],
  ["export default", /\bexport\s+default\b/],
  ["default alias export", /\bas\s+default\b/],
  ["try", /\btry\b/],
  ["catch", /\bcatch\b/],
];

function violationsIn(scanned: Scanned): string[] {
  return FORBIDDEN.filter(([, pattern]) => pattern.test(scanned.code)).map(([name]) => name);
}

function importViolations(file: string, scanned: Scanned): string[] {
  const inTesting = file.startsWith(TESTING + path.sep);
  const problems: string[] = [];
  for (const spec of specifiersOf(scanned)) {
    if (spec.startsWith("node:")) problems.push(`node: import ${spec}`);
    else if (spec.startsWith(".")) {
      const resolved = path.resolve(path.dirname(file), spec);
      if (resolved !== PACKAGE_ROOT && !resolved.startsWith(PACKAGE_ROOT + path.sep)) {
        problems.push(`import outside the package ${spec}`);
      }
    } else if (!(inTesting && spec === "fast-check")) {
      problems.push(`import of non-local module ${spec}`);
    }
  }
  return problems;
}

describe("scanner (used by the static checks below) _Requirements: 1.2, 1.3_", () => {
  it("ignores forbidden words in comments, strings, templates and regexes", () => {
    const src = [
      "// Date and try/catch in a line comment",
      "/* fetch(Math.random()) in a block comment */",
      'const a = "Date.now() and node:fs";',
      "const b = 'setTimeout';",
      "const c = `crypto ${1 + 1} performance`;",
      "const d = /try|catch/.test(a);",
    ].join("\n");
    expect(violationsIn(scan(src))).toEqual([]);
  });

  it("finds forbidden words in code, including inside template substitutions", () => {
    expect(violationsIn(scan("const t = Date.now();"))).toEqual(["Date"]);
    expect(violationsIn(scan("const r = `x ${Math.random()}`;"))).toEqual(["Math.random"]);
    expect(violationsIn(scan(["tr", "y { f(); } catch (e) { g(); }"].join("")))).toEqual([
      "try",
      "catch",
    ]);
    expect(violationsIn(scan("export default function f() {}"))).toEqual(["export default"]);
    expect(violationsIn(scan("const x = a / b; fetch(x);"))).toEqual(["fetch"]);
    expect(violationsIn(scan("document.body.append(x);"))).toEqual(["DOM document"]);
    expect(violationsIn(scan("const document = next.value; return { document };"))).toEqual([]);
  });

  it("does not flag property names or identifiers that merely contain a word", () => {
    expect(violationsIn(scan("const o = { x: doc.Date, y: updateDate, z: s.fetch };"))).toEqual([]);
  });

  it("reads import specifiers from code only", () => {
    const src = [
      'import { a } from "./a.js";',
      'import type { B } from "../b.js";',
      'import json from "./x.json" with { type: "json" };',
      'export { c } from "node:fs";',
      '// import { z } from "ignored";',
      'const s = "from \\"nope\\"";',
    ].join("\n");
    expect(specifiersOf(scan(src))).toEqual(["./a.js", "../b.js", "./x.json", "node:fs"]);
  });
});

describe("engine package.json has no runtime dependencies _Requirements: 1.1_", () => {
  const pkg: unknown = JSON.parse(readFileSync(path.join(PACKAGE_ROOT, "package.json"), "utf8"));
  const record = pkg as Record<string, unknown>;

  it.each(["dependencies", "optionalDependencies", "peerDependencies"])(
    "%s is empty or absent",
    (field) => {
      const value = record[field];
      expect(value === undefined || Object.keys(value as object).length === 0).toBe(true);
    },
  );

  it("declares test tooling only under devDependencies", () => {
    const dev = record["devDependencies"] as Record<string, string>;
    expect(Object.keys(dev)).toEqual(expect.arrayContaining(["vitest", "fast-check"]));
  });
});

describe("engine sources are pure _Requirements: 1.2, 1.3, 1.9_", () => {
  it("finds source files to check", () => {
    expect(SOURCE_FILES.length).toBeGreaterThan(30);
    expect(SOURCE_FILES.some((f) => f.startsWith(TESTING + path.sep))).toBe(true);
  });

  it.each(SOURCE_FILES.map((f) => [rel(f), f] as const))(
    "%s has no forbidden construct",
    (_name, file) => {
      const scanned = scan(readFileSync(file, "utf8"));
      expect([...violationsIn(scanned), ...importViolations(file, scanned)]).toEqual([]);
    },
  );

  it("index.ts does not re-export testing/", () => {
    const scanned = scan(readFileSync(path.join(SRC, "index.ts"), "utf8"));
    const specs = specifiersOf(scanned);
    expect(specs.length).toBeGreaterThan(0);
    expect(specs.filter((s) => /(^|\/)testing(\/|$)/.test(s))).toEqual([]);
  });
});

describe("vendored reporter list _Requirements: 14.1, 14.2, 14.4_", () => {
  const entries = JSON.parse(
    readFileSync(path.join(CITATIONS, "reporters.json"), "utf8"),
  ) as unknown;

  it("reporters.json is an array of non-empty, trimmed, unique strings", () => {
    expect(Array.isArray(entries)).toBe(true);
    const list = entries as unknown[];
    expect(list.length).toBeGreaterThan(0);
    for (const entry of list) {
      expect(typeof entry).toBe("string");
      expect((entry as string).length).toBeGreaterThan(0);
      expect(entry).toBe((entry as string).trim());
    }
    expect(new Set(list).size).toBe(list.length);
  });

  it("the licence note names the licence, repository, version or commit, and date", () => {
    const note = readFileSync(path.join(CITATIONS, "REPORTERS_LICENSE.md"), "utf8");
    expect(note).toMatch(/^- Licence: \S+/m);
    expect(note).toMatch(/^- Repository: https:\/\/github\.com\/freelawproject\/reporters-db\s*$/m);
    expect(note).toMatch(/^- Release tag: `v\d+\.\d+\.\d+`/m);
    expect(note).toMatch(/^- Commit: `[0-9a-f]{40}`/m);
    expect(note).toMatch(/^- Generation date: \d{4}-\d{2}-\d{2}\s*$/m);
  });

  it("the only JSON data files in src are the two vendored lists", () => {
    const json = listFiles(SRC, /\.json$/).map((f) => path.relative(CITATIONS, f));
    expect(json).toEqual(["lexis-courts.json", "reporters.json"]);
  });

  it("only reporters.ts imports reporters.json", () => {
    const importers = SOURCE_FILES.filter((f) =>
      specifiersOf(scan(readFileSync(f, "utf8"))).some((s) => s.endsWith("reporters.json")),
    );
    expect(importers.map(rel)).toEqual(["src/citations/reporters.ts"]);
  });

  it("no other non-testing source file embeds a second reporter list", () => {
    const reporterSet = new Set(entries as string[]);
    const MAX_LISTED_PER_FILE = 20;
    const offenders = SOURCE_FILES.filter(
      (f) => !f.startsWith(TESTING + path.sep) && f !== path.join(CITATIONS, "reporters.ts"),
    )
      .map((f) => {
        const distinct = new Set(
          scan(readFileSync(f, "utf8")).strings.filter((s) => reporterSet.has(s)),
        );
        return [rel(f), distinct.size] as const;
      })
      .filter(([, count]) => count > MAX_LISTED_PER_FILE);
    expect(offenders).toEqual([]);
  });
});
