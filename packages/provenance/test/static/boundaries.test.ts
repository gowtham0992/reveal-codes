import { builtinModules } from "node:module";
import { join } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import {
  PROVENANCE_ROOT,
  at,
  format,
  isFunctionNode,
  lineOf,
  parse,
  readTree,
  walk,
  type Source,
  type Violation,
} from "../support/scan.js";

const SRC = readTree(join(PROVENANCE_ROOT, "src"), ".ts");
const TESTS = readTree(join(PROVENANCE_ROOT, "test"), ".ts");
const BUILTINS = new Set(builtinModules);
const NETWORK_MODULES = new Set(["http", "https", "http2", "net", "tls", "dgram", "dns", "undici"]);
const NETWORK_NAMES = new Set(["fetch", "XMLHttpRequest", "WebSocket", "EventSource"]);

function src(text: string, name = "src/io/planted.ts"): Source {
  return { path: name, text };
}

function check(file: Source, visit: (n: ts.Node, sf: ts.SourceFile, out: Violation[]) => void) {
  const sf = parse(file);
  const out: Violation[] = [];
  walk(sf, (n) => {
    visit(n, sf, out);
  });
  return out;
}

/** The module specifier of an import, an export-from, `import("x")` or `require("x")`, else null. */
function specifierOf(n: ts.Node): string | null {
  if ((ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) && n.moduleSpecifier) {
    return ts.isStringLiteral(n.moduleSpecifier) ? n.moduleSpecifier.text : null;
  }
  if (ts.isCallExpression(n) && n.arguments.length > 0) {
    const callee = n.expression;
    const isLoad =
      callee.kind === ts.SyntaxKind.ImportKeyword ||
      (ts.isIdentifier(callee) && callee.text === "require");
    const first = n.arguments[0];
    if (isLoad && first !== undefined && ts.isStringLiteral(first)) return first.text;
  }
  return null;
}

/** `node:fs`, `fs` and `fs/promises` all name a built-in module; the bare name is returned. */
function builtinName(spec: string): string | null {
  const bare = spec.startsWith("node:") ? spec.slice(5) : spec;
  const root = bare.split("/")[0] ?? bare;
  return spec.startsWith("node:") || BUILTINS.has(root) ? bare : null;
}

const inDir = (file: Source, dir: string): boolean => file.path.includes(`/${dir}/`);

/** Requirement 1.5: no `node:` import, and no built-in module by its bare name, under src/core. */
function coreViolations(file: Source): Violation[] {
  if (!inDir(file, "core")) return [];
  return check(file, (n, sf, out) => {
    const spec = specifierOf(n);
    if (spec !== null && builtinName(spec) !== null) {
      out.push(at(file, lineOf(sf, n), `built-in module "${spec}" under src/core`));
    }
  });
}

/** Requirement 1.8: `process.env` only in src/io/env.ts. */
function envViolations(file: Source): Violation[] {
  if (file.path.endsWith("/src/io/env.ts")) return [];
  return check(file, (n, sf, out) => {
    const target = ts.isPropertyAccessExpression(n) || ts.isElementAccessExpression(n);
    if (!target || n.expression.getText(sf) !== "process") return;
    const name = ts.isPropertyAccessExpression(n) ? n.name.text : n.argumentExpression.getText(sf);
    if (name === "env" || name === '"env"') out.push(at(file, lineOf(sf, n), "process.env"));
  });
}

/** Requirement 3.20: src/io reads no `KIRO_*` or `VSCODE_*` variable, even by name. */
function surfaceVariableViolations(file: Source): Violation[] {
  if (!inDir(file, "io")) return [];
  return check(file, (n, sf, out) => {
    const text = ts.isStringLiteralLike(n) ? n.text : ts.isIdentifier(n) ? n.text : "";
    if (/(^|[^A-Za-z0-9])(KIRO|VSCODE)_[A-Z0-9_]+/.test(text)) {
      out.push(at(file, lineOf(sf, n), `surface variable ${text}`));
    }
  });
}

/** Requirement 1.9: no network module and no network global. */
function networkViolations(file: Source): Violation[] {
  return check(file, (n, sf, out) => {
    const line = lineOf(sf, n);
    const spec = specifierOf(n);
    const name = spec === null ? null : (builtinName(spec) ?? spec);
    if (name !== null && NETWORK_MODULES.has(name.split("/")[0] ?? name)) {
      out.push(at(file, line, `network module "${spec ?? ""}"`));
    }
    if (ts.isIdentifier(n) && NETWORK_NAMES.has(n.text)) {
      out.push(at(file, line, `network name ${n.text}`));
    }
  });
}

/** Requirement 1.3: the SDK and zod are imported only under src/mcp. */
function sdkViolations(file: Source): Violation[] {
  if (inDir(file, "mcp")) return [];
  return check(file, (n, sf, out) => {
    const spec = specifierOf(n);
    if (spec === null) return;
    if (spec.startsWith("@modelcontextprotocol/") || spec === "zod" || spec.startsWith("zod/")) {
      out.push(at(file, lineOf(sf, n), `"${spec}" outside src/mcp`));
    }
  });
}

/** Requirement 1.4 (design): the Engine is imported only as `@reveal-codes/engine`. */
function engineEntryViolations(file: Source): Violation[] {
  return check(file, (n, sf, out) => {
    const spec = specifierOf(n);
    if (spec === null || spec === "@reveal-codes/engine") return;
    const deep =
      spec.startsWith("@reveal-codes/engine/") || /(^|\/)engine\/(src|dist)\b/.test(spec);
    if (deep)
      out.push(at(file, lineOf(sf, n), `Engine import "${spec}" bypasses the public entry`));
  });
}

/** Requirement 1.6: no `any`, no default export, no class. */
function styleViolations(file: Source): Violation[] {
  return check(file, (n, sf, out) => {
    const line = lineOf(sf, n);
    if (n.kind === ts.SyntaxKind.AnyKeyword) out.push(at(file, line, "any"));
    if (ts.isClassDeclaration(n) || ts.isClassExpression(n)) out.push(at(file, line, "class"));
    if (ts.isExportAssignment(n) && !n.isExportEquals) out.push(at(file, line, "default export"));
    const mods = ts.canHaveModifiers(n) ? ts.getModifiers(n) : undefined;
    if (mods?.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword)) {
      out.push(at(file, line, "default export"));
    }
    if (ts.isExportSpecifier(n) && n.name.text === "default") {
      out.push(at(file, line, "default export"));
    }
  });
}

/** Requirement 1.7: modules at most 300 lines, functions at most 40. */
function sizeViolations(file: Source): Violation[] {
  const lines = file.text.split("\n").length - (file.text.endsWith("\n") ? 1 : 0);
  const out: Violation[] = lines > 300 ? [at(file, 1, `module has ${String(lines)} lines`)] : [];
  const sf = parse(file);
  walk(sf, (n) => {
    if (!isFunctionNode(n)) return;
    const a = sf.getLineAndCharacterOfPosition(n.getStart(sf)).line;
    const count = sf.getLineAndCharacterOfPosition(n.getEnd()).line - a + 1;
    if (count > 40) out.push(at(file, a + 1, `function has ${String(count)} lines`));
  });
  return out;
}

describe("provenance source boundaries _Requirements: 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 3.20_", () => {
  it("self-test: planted built-in imports under core are reported", () => {
    const planted = src(
      'import a from "node:fs";\nimport b from "path";\nimport c from "./x.js";\n',
      "src/core/p.ts",
    );
    expect(format(coreViolations(planted))).toEqual([
      'src/core/p.ts:1 built-in module "node:fs" under src/core',
      'src/core/p.ts:2 built-in module "path" under src/core',
    ]);
    expect(coreViolations(src('import a from "node:fs";', "src/io/p.ts"))).toEqual([]);
  });

  it("no module under src/core imports a node: or built-in module", () => {
    expect(SRC.filter((f) => inDir(f, "core")).length).toBeGreaterThan(5);
    expect(format(SRC.flatMap(coreViolations))).toEqual([]);
  });

  it("self-test: a planted process.env is reported outside env.ts only", () => {
    const planted = src(
      'const a = process.env;\nconst b = process["env"];\nconst c = process.argv;\n',
    );
    expect(format(envViolations(planted))).toEqual([
      "src/io/planted.ts:1 process.env",
      "src/io/planted.ts:2 process.env",
    ]);
    expect(envViolations(src("const a = process.env;", "x/src/io/env.ts"))).toEqual([]);
  });

  it("process.env appears in src/io/env.ts only", () => {
    expect(format(SRC.flatMap(envViolations))).toEqual([]);
    const readers = SRC.filter((f) => /process\.env|process\["env"\]/.test(f.text));
    expect(readers.map((f) => f.path.slice(PROVENANCE_ROOT.length))).toEqual(["/src/io/env.ts"]);
  });

  it("self-test: a planted KIRO_ or VSCODE_ name under src/io is reported", () => {
    const planted = src(
      'const a = env["KIRO_SESSION"];\nconst b = "VSCODE_PID";\nconst c = "NO_COLOR";\n',
    );
    expect(format(surfaceVariableViolations(planted))).toEqual([
      "src/io/planted.ts:1 surface variable KIRO_SESSION",
      "src/io/planted.ts:2 surface variable VSCODE_PID",
    ]);
  });

  it("src/io reads no KIRO_* or VSCODE_* variable", () => {
    expect(SRC.filter((f) => inDir(f, "io")).length).toBeGreaterThan(5);
    expect(format(SRC.flatMap(surfaceVariableViolations))).toEqual([]);
  });

  it("self-test: planted network use is reported", () => {
    const planted = src(
      'import h from "node:https";\nconst r = fetch("x");\nimport n from "net";\n',
    );
    expect(format(networkViolations(planted))).toEqual([
      'src/io/planted.ts:1 network module "node:https"',
      "src/io/planted.ts:2 network name fetch",
      'src/io/planted.ts:3 network module "net"',
    ]);
  });

  it("src makes no network request: no fetch, http, https or net", () => {
    expect(format(SRC.flatMap(networkViolations))).toEqual([]);
  });

  it("self-test: a planted SDK or zod import outside src/mcp is reported", () => {
    const planted = src(
      'import { z } from "zod";\nimport s from "@modelcontextprotocol/sdk/server";\n',
    );
    expect(format(sdkViolations(planted))).toEqual([
      'src/io/planted.ts:1 "zod" outside src/mcp',
      'src/io/planted.ts:2 "@modelcontextprotocol/sdk/server" outside src/mcp',
    ]);
    expect(sdkViolations(src('import { z } from "zod";', "src/mcp/p.ts"))).toEqual([]);
  });

  it("the SDK and zod are imported only under src/mcp", () => {
    expect(format(SRC.flatMap(sdkViolations))).toEqual([]);
    const users = SRC.filter((f) => /from "(zod|@modelcontextprotocol\/)/.test(f.text));
    expect(users.length).toBeGreaterThan(0);
    expect(users.every((f) => inDir(f, "mcp"))).toBe(true);
  });

  it("self-test: a planted deep Engine import is reported", () => {
    const planted = src(
      'import a from "@reveal-codes/engine/src/document.js";\nimport b from "../../engine/src/x.js";\nimport c from "@reveal-codes/engine";\n',
    );
    expect(format(engineEntryViolations(planted))).toEqual([
      'src/io/planted.ts:1 Engine import "@reveal-codes/engine/src/document.js" bypasses the public entry',
      'src/io/planted.ts:2 Engine import "../../engine/src/x.js" bypasses the public entry',
    ]);
  });

  it("src and tests import the Engine only through @reveal-codes/engine", () => {
    expect(format([...SRC, ...TESTS].flatMap(engineEntryViolations))).toEqual([]);
    expect(SRC.some((f) => /from "@reveal-codes\/engine"/.test(f.text))).toBe(true);
  });

  it("self-test: planted any, class and default export are reported", () => {
    const planted = src(
      "const a: any = 1;\nclass C {}\nexport default a;\nexport default function f() {}\nexport { a as default };\n",
    );
    const found = format(styleViolations(planted));
    expect(found).toContain("src/io/planted.ts:1 any");
    expect(found).toContain("src/io/planted.ts:2 class");
    expect(found).toContain("src/io/planted.ts:3 default export");
    expect(found).toContain("src/io/planted.ts:4 default export");
    expect(found).toContain("src/io/planted.ts:5 default export");
  });

  it("src has no any, default export or class", () => {
    expect(format(SRC.flatMap(styleViolations))).toEqual([]);
  });

  it("self-test: a planted long module and long function are reported", () => {
    const body = Array.from({ length: 41 }, (_, i) => `  const v${String(i)} = ${String(i)};`);
    expect(format(sizeViolations(src(`function big() {\n${body.join("\n")}\n}\n`)))).toEqual([
      "src/io/planted.ts:1 function has 43 lines",
    ]);
    const long = src(Array.from({ length: 301 }, () => "export {};").join("\n"));
    expect(format(sizeViolations(long))).toEqual(["src/io/planted.ts:1 module has 301 lines"]);
  });

  it("every src module is at most 300 lines and every function at most 40", () => {
    expect(format(SRC.flatMap(sizeViolations))).toEqual([]);
  });
});
