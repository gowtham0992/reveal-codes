/** A minimal CSS reader for the static rules: declarations with selector, enclosing at-rules and line. */
export type CssDeclaration = {
  readonly selector: string;
  readonly atRules: readonly string[];
  readonly prop: string;
  readonly value: string;
  readonly line: number;
};
export type CssAtRule = { readonly name: string; readonly prelude: string; readonly line: number };
export type ParsedCss = {
  readonly declarations: CssDeclaration[];
  readonly atRules: CssAtRule[];
};

type Frame = { selector: string; atRule: string | null };

function blankComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));
}

function currentSelector(stack: readonly Frame[]): string {
  for (let i = stack.length - 1; i >= 0; i -= 1) {
    const frame = stack[i];
    if (frame !== undefined && frame.atRule === null) return frame.selector;
  }
  return "";
}

function atRulesOf(stack: readonly Frame[]): string[] {
  return stack.flatMap((f) => (f.atRule === null ? [] : [f.atRule]));
}

type Parser = {
  declarations: CssDeclaration[];
  atRules: CssAtRule[];
  stack: Frame[];
  buffer: string;
  bufferLine: number;
  line: number;
};

function flush(p: Parser): void {
  const body = p.buffer.trim();
  p.buffer = "";
  const colon = body.indexOf(":");
  if (p.stack.length === 0 || colon < 0) return;
  p.declarations.push({
    selector: currentSelector(p.stack),
    atRules: atRulesOf(p.stack),
    prop: body.slice(0, colon).trim().toLowerCase(),
    value: body.slice(colon + 1).trim(),
    line: p.bufferLine,
  });
}

function open(p: Parser): void {
  const prelude = p.buffer.trim().replace(/\s+/g, " ");
  p.buffer = "";
  if (prelude.startsWith("@")) {
    const name = prelude.split(/[\s(]/)[0] ?? prelude;
    p.atRules.push({ name, prelude, line: p.bufferLine });
    p.stack.push({ selector: "", atRule: prelude });
  } else {
    p.stack.push({ selector: prelude, atRule: null });
  }
}

function step(p: Parser, ch: string): void {
  if (ch === "{") open(p);
  else if (ch === "}") {
    flush(p);
    p.stack.pop();
  } else if (ch === ";") flush(p);
  else {
    if (p.buffer.trim() === "" && ch.trim() !== "") p.bufferLine = p.line;
    p.buffer += ch;
  }
  if (ch === "\n") p.line += 1;
}

export function parseCss(text: string): ParsedCss {
  const p: Parser = {
    declarations: [],
    atRules: [],
    stack: [],
    buffer: "",
    bufferLine: 1,
    line: 1,
  };
  for (const ch of blankComments(text)) step(p, ch);
  return { declarations: p.declarations, atRules: p.atRules };
}
