import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

/** One rule violation, reported as `file:line message`. `file` is relative to `apps/web`. */
export type Violation = { readonly file: string; readonly line: number; readonly message: string };
export type SourceText = { readonly path: string; readonly text: string };

export const WEB_ROOT = fileURLToPath(new URL("../../", import.meta.url));

const SKIPPED_DIRECTORIES = new Set(["node_modules", ".next", "dist", "coverage"]);

/** Lists files under `dir` whose name matches `pattern`; a missing directory gives an empty list. */
export function walkFiles(dir: string, pattern: RegExp): string[] {
  if (!existsSync(dir)) return [];
  const found: string[] = [];
  for (const name of readdirSync(dir).sort()) {
    if (SKIPPED_DIRECTORIES.has(name)) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) found.push(...walkFiles(full, pattern));
    else if (pattern.test(name)) found.push(full);
  }
  return found;
}

/** Reads files under the given `apps/web`-relative directories. Missing directories contribute nothing. */
export function readSources(dirs: readonly string[], pattern = /\.tsx?$/): SourceText[] {
  return dirs
    .flatMap((dir) => walkFiles(join(WEB_ROOT, dir), pattern))
    .map((full) => ({
      path: relative(WEB_ROOT, full).split("\\").join("/"),
      text: readFileSync(full, "utf8"),
    }));
}

export function lineOfIndex(text: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index && i < text.length; i += 1) {
    if (text.charCodeAt(i) === 10) line += 1;
  }
  return line;
}

export function violation(file: string, line: number, message: string): Violation {
  return { file, line, message };
}

export function formatViolations(violations: readonly Violation[]): string[] {
  return violations.map((v) => `${v.file}:${String(v.line)} ${v.message}`);
}

export function parseSource(file: SourceText): ts.SourceFile {
  const kind = file.path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  return ts.createSourceFile(file.path, file.text, ts.ScriptTarget.ES2022, true, kind);
}

export function lineOfNode(sf: ts.SourceFile, node: ts.Node): number {
  return sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
}

export function visit(node: ts.Node, fn: (n: ts.Node) => void): void {
  fn(node);
  ts.forEachChild(node, (child) => {
    visit(child, fn);
  });
}

export function collect<T extends ts.Node>(sf: ts.SourceFile, guard: (n: ts.Node) => n is T): T[] {
  const found: T[] = [];
  visit(sf, (n) => {
    if (guard(n)) found.push(n);
  });
  return found;
}

/** Every node for which `predicate` holds, in source order. */
export function findAll(sf: ts.SourceFile, predicate: (n: ts.Node) => boolean): ts.Node[] {
  const found: ts.Node[] = [];
  visit(sf, (n) => {
    if (predicate(n)) found.push(n);
  });
  return found;
}

type Range = readonly [number, number];

function commentRanges(sf: ts.SourceFile): Range[] {
  const seen = new Set<number>();
  const ranges: Range[] = [];
  const add = (found: ts.CommentRange[] | undefined): void => {
    for (const r of found ?? []) {
      if (seen.has(r.pos)) continue;
      seen.add(r.pos);
      ranges.push([r.pos, r.end]);
    }
  };
  visit(sf, (n) => {
    if (n.kind !== ts.SyntaxKind.JsxText) add(ts.getLeadingCommentRanges(sf.text, n.pos));
    add(ts.getTrailingCommentRanges(sf.text, n.end));
  });
  return ranges;
}

/** The part of a literal node that is text (quotes and `${` delimiters excluded). */
function literalInterior(node: ts.Node, sf: ts.SourceFile): Range | null {
  const start = node.getStart(sf);
  switch (node.kind) {
    case ts.SyntaxKind.StringLiteral:
    case ts.SyntaxKind.NoSubstitutionTemplateLiteral:
    case ts.SyntaxKind.TemplateTail:
      return [start + 1, node.end - 1];
    case ts.SyntaxKind.TemplateHead:
    case ts.SyntaxKind.TemplateMiddle:
      return [start + 1, node.end - 2];
    case ts.SyntaxKind.RegularExpressionLiteral:
      return [start, node.end];
    case ts.SyntaxKind.JsxText:
      return [node.pos, node.end];
    default:
      return null;
  }
}

/**
 * Returns the file text with comments, string and template contents, regular
 * expressions and JSX text replaced by spaces. Offsets and line numbers are
 * unchanged, so a regular expression over the result reports true lines.
 */
export function stripNoise(file: SourceText): string {
  const sf = parseSource(file);
  const chars = file.text.split("");
  const blank = ([from, to]: Range): void => {
    for (let i = from; i < to; i += 1) {
      if (chars[i] !== "\n" && chars[i] !== "\r") chars[i] = " ";
    }
  };
  commentRanges(sf).forEach(blank);
  visit(sf, (n) => {
    const interior = literalInterior(n, sf);
    if (interior !== null) blank(interior);
  });
  return chars.join("");
}

/** Regular-expression scan over `stripNoise(file)`; reports one violation per match with its line. */
export function scanStripped(file: SourceText, pattern: RegExp, message: string): Violation[] {
  const stripped = stripNoise(file);
  const global = new RegExp(
    pattern.source,
    pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`,
  );
  return [...stripped.matchAll(global)].map((m) =>
    violation(file.path, lineOfIndex(stripped, m.index), message),
  );
}

export type TextLiteral = { readonly line: number; readonly text: string };

function isModuleSpecifier(node: ts.Node): boolean {
  const parent = node.parent;
  if (ts.isImportDeclaration(parent) || ts.isExportDeclaration(parent)) {
    return parent.moduleSpecifier === node;
  }
  return (
    ts.isCallExpression(parent) &&
    (parent.expression.kind === ts.SyntaxKind.ImportKeyword ||
      (ts.isIdentifier(parent.expression) && parent.expression.text === "require"))
  );
}

/** String literals, template parts and JSX text, in source order. Module specifiers are skipped. */
export function textLiterals(file: SourceText): TextLiteral[] {
  const sf = parseSource(file);
  const found: TextLiteral[] = [];
  visit(sf, (n) => {
    const isText =
      ts.isStringLiteral(n) ||
      ts.isNoSubstitutionTemplateLiteral(n) ||
      ts.isTemplateHead(n) ||
      ts.isTemplateMiddle(n) ||
      ts.isTemplateTail(n) ||
      ts.isJsxText(n);
    if (!isText || isModuleSpecifier(n)) return;
    if (ts.isJsxText(n) && n.text.trim() === "") return;
    found.push({ line: lineOfNode(sf, n), text: n.text });
  });
  return found;
}

export type ImportRef = {
  readonly line: number;
  readonly spec: string;
  readonly typeOnly: boolean;
};

function importDeclarationTypeOnly(node: ts.ImportDeclaration): boolean {
  const clause = node.importClause;
  if (clause === undefined) return false;
  if (clause.phaseModifier === ts.SyntaxKind.TypeKeyword) return true;
  const named = clause.namedBindings;
  return (
    clause.name === undefined &&
    named !== undefined &&
    ts.isNamedImports(named) &&
    named.elements.length > 0 &&
    named.elements.every((e) => e.isTypeOnly)
  );
}

function exportDeclarationTypeOnly(node: ts.ExportDeclaration): boolean {
  const clause = node.exportClause;
  if (node.isTypeOnly) return true;
  return (
    clause !== undefined &&
    ts.isNamedExports(clause) &&
    clause.elements.length > 0 &&
    clause.elements.every((e) => e.isTypeOnly)
  );
}

/** Every module reference: import and export-from declarations, `import()`, `require()`, `import("x").T`. */
export function importsOf(file: SourceText): ImportRef[] {
  const sf = parseSource(file);
  const refs: ImportRef[] = [];
  const add = (node: ts.Node, spec: string, typeOnly: boolean): void => {
    refs.push({ line: lineOfNode(sf, node), spec, typeOnly });
  };
  visit(sf, (n) => {
    if (ts.isImportDeclaration(n) && ts.isStringLiteral(n.moduleSpecifier)) {
      add(n, n.moduleSpecifier.text, importDeclarationTypeOnly(n));
    } else if (
      ts.isExportDeclaration(n) &&
      n.moduleSpecifier !== undefined &&
      ts.isStringLiteral(n.moduleSpecifier)
    ) {
      add(n, n.moduleSpecifier.text, exportDeclarationTypeOnly(n));
    } else if (ts.isCallExpression(n)) {
      const arg = n.arguments[0];
      const isLoader =
        n.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(n.expression) && n.expression.text === "require");
      if (isLoader && arg !== undefined && ts.isStringLiteral(arg)) add(n, arg.text, false);
    } else if (ts.isImportTypeNode(n) && ts.isLiteralTypeNode(n.argument)) {
      if (ts.isStringLiteral(n.argument.literal)) add(n, n.argument.literal.text, true);
    }
  });
  return refs;
}

export type FunctionSpan = {
  readonly name: string;
  readonly line: number;
  readonly lines: number;
  readonly node: ts.Node;
};

function isFunctionNode(n: ts.Node): n is ts.FunctionLikeDeclaration {
  return (
    ts.isFunctionDeclaration(n) ||
    ts.isFunctionExpression(n) ||
    ts.isArrowFunction(n) ||
    ts.isMethodDeclaration(n) ||
    ts.isConstructorDeclaration(n) ||
    ts.isGetAccessorDeclaration(n) ||
    ts.isSetAccessorDeclaration(n)
  );
}

function nameOfFunction(n: ts.FunctionLikeDeclaration): string {
  if (n.name !== undefined) return n.name.getText();
  const parent = n.parent;
  if (ts.isVariableDeclaration(parent) || ts.isPropertyAssignment(parent))
    return parent.name.getText();
  return "(anonymous)";
}

/** Every function-like node with its physical line span (signature and body). */
export function functionsOf(file: SourceText): FunctionSpan[] {
  const sf = parseSource(file);
  return collect(sf, isFunctionNode).map((n) => {
    const first = sf.getLineAndCharacterOfPosition(n.getStart(sf)).line;
    const last = sf.getLineAndCharacterOfPosition(n.end).line;
    return { name: nameOfFunction(n), line: first + 1, lines: last - first + 1, node: n };
  });
}
