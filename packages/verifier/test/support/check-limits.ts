import ts from "typescript";

export const MAX_FILE_LINES = 300;
export const MAX_FUNCTION_LINES = 40;

/** One violation, reported as `file:line message`. */
export type Violation = { readonly file: string; readonly line: number; readonly message: string };

type Ctx = { readonly file: string; readonly sf: ts.SourceFile; readonly out: Violation[] };

function lineOf(sf: ts.SourceFile, pos: number): number {
  return sf.getLineAndCharacterOfPosition(pos).line + 1;
}

function add(ctx: Ctx, node: ts.Node, message: string): void {
  ctx.out.push({ file: ctx.file, line: lineOf(ctx.sf, node.getStart(ctx.sf)), message });
}

function callName(expr: ts.Expression): string {
  return ts.isIdentifier(expr) ? expr.text : "";
}

function containsNode(root: ts.Node, test: (n: ts.Node) => boolean): boolean {
  let found = false;
  const visit = (n: ts.Node): void => {
    if (found) return;
    if (test(n)) found = true;
    else ts.forEachChild(n, visit);
  };
  visit(root);
  return found;
}

function isRethrowOrErr(n: ts.Node): boolean {
  if (ts.isThrowStatement(n)) return true;
  if (ts.isReturnStatement(n) && n.expression !== undefined) {
    return ts.isCallExpression(n.expression) && callName(n.expression.expression) === "err";
  }
  return ts.isCallExpression(n) && callName(n.expression) === "expect";
}

/** Callbacks of `describe(...)` only group tests; they are not measured. */
function isDescribeCallback(fn: ts.Node): boolean {
  const p = fn.parent;
  if (!ts.isCallExpression(p)) return false;
  const e = p.expression;
  const name = ts.isIdentifier(e)
    ? e.text
    : ts.isPropertyAccessExpression(e)
      ? callName(e.expression)
      : "";
  return name === "describe";
}

function checkFunction(ctx: Ctx, fn: ts.FunctionLikeDeclaration): void {
  if (fn.body === undefined || isDescribeCallback(fn)) return;
  const start = lineOf(ctx.sf, fn.body.getStart(ctx.sf));
  const end = lineOf(ctx.sf, fn.body.getEnd());
  const lines = end - start + 1;
  if (lines > MAX_FUNCTION_LINES) add(ctx, fn, `function body is ${String(lines)} lines`);
}

function checkNode(ctx: Ctx, node: ts.Node): void {
  if (node.kind === ts.SyntaxKind.AnyKeyword) add(ctx, node, "uses `any`");
  if (ts.isExportAssignment(node) && node.isExportEquals !== true) add(ctx, node, "export default");
  const mods = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
  const isDefault = mods?.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword) === true;
  if (isDefault) add(ctx, node, "export default");
  if (ts.isCatchClause(node) && !containsNode(node.block, isRethrowOrErr)) {
    add(ctx, node, "catch neither rethrows, returns err(...), nor asserts");
  }
  if (ts.isFunctionLike(node) && "body" in node) checkFunction(ctx, node);
}

/** Checks one source text against the file, function, `any`, default-export and catch rules. */
export function checkLimits(file: string, text: string): Violation[] {
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
  const ctx: Ctx = { file, sf, out: [] };
  const lines = text.endsWith("\n") ? text.split("\n").length - 1 : text.split("\n").length;
  if (lines > MAX_FILE_LINES)
    ctx.out.push({ file, line: 1, message: `file is ${String(lines)} lines` });
  const visit = (n: ts.Node): void => {
    checkNode(ctx, n);
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return ctx.out;
}

export function formatViolation(v: Violation): string {
  return `${v.file}:${String(v.line)} ${v.message}`;
}
