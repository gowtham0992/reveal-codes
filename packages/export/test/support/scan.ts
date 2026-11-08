// Source scanning helpers for the package boundary tests. Test support only.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

export type Source = { readonly path: string; readonly text: string };
export type Violation = { readonly file: string; readonly line: number; readonly message: string };

export const PACKAGE_ROOT = fileURLToPath(new URL("../../", import.meta.url));

export function readDir(dir: string, suffix: string): Source[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith(suffix))
    .sort()
    .map((f) => ({ path: join(dir, f), text: readFileSync(join(dir, f), "utf8") }));
}

export function parse(src: Source): ts.SourceFile {
  return ts.createSourceFile(src.path, src.text, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
}

export function lineOf(sf: ts.SourceFile, node: ts.Node): number {
  return sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
}

export function walk(node: ts.Node, fn: (n: ts.Node) => void): void {
  fn(node);
  ts.forEachChild(node, (c) => {
    walk(c, fn);
  });
}

export function at(src: Source, line: number, message: string): Violation {
  return { file: src.path, line, message };
}

export function format(violations: readonly Violation[]): string[] {
  return violations.map((v) => `${v.file}:${String(v.line)} ${v.message}`);
}

export function isFunctionNode(n: ts.Node): n is ts.FunctionLikeDeclaration {
  return (
    ts.isFunctionDeclaration(n) ||
    ts.isFunctionExpression(n) ||
    ts.isArrowFunction(n) ||
    ts.isMethodDeclaration(n) ||
    ts.isConstructorDeclaration(n) ||
    ts.isGetAccessor(n) ||
    ts.isSetAccessor(n)
  );
}

/** Text of every string and template literal piece, with its line. */
export function literals(src: Source): { line: number; text: string }[] {
  const sf = parse(src);
  const out: { line: number; text: string }[] = [];
  walk(sf, (n) => {
    if (
      ts.isStringLiteral(n) ||
      ts.isNoSubstitutionTemplateLiteral(n) ||
      ts.isTemplateHead(n) ||
      ts.isTemplateMiddle(n) ||
      ts.isTemplateTail(n)
    ) {
      out.push({ line: lineOf(sf, n), text: n.text });
    }
  });
  return out;
}
