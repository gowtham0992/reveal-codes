import ts from "typescript";
import { describe, expect, it } from "vitest";
import {
  collect,
  findAll,
  formatViolations,
  importsOf,
  lineOfNode,
  parseSource,
  readSources,
  textLiterals,
  violation,
  type SourceText,
  type Violation,
} from "../support/scan";

const NEXT_ROUTE_FILE = /^app\/(?:.*\/)?(?:page|layout|route)\.tsx?$/;
const FETCH_OWNERS = /^(?:src\/client\/api\.ts|src\/server\/deps\.ts|src\/server\/llm[\w-]*\.ts)$/;
const SDK_ADAPTERS = /^src\/server\/llm-(?:bedrock|anthropic|default)\.ts$/;
const CLOCK_FREE =
  /^src\/(?:store|store-runtime|history|notices|persist|autosave)\.ts$|^src\/editor\//;
const DOWNLOAD_OWNER = "src/client/download.ts";
const SDK_SPEC = /^(?:ai|@ai-sdk\/.+)(?:\/.*)?$/;
const EXPORT_LIBS = /^(?:docx|file-saver|jspdf|html2canvas)(?:\/.*)?$/;
const ENGINE_OR_VERIFIER =
  /@reveal-codes\/(?:engine|verifier)|(?:^|\/)packages\/(?:engine|verifier)(?:\/|$)/;

/** Requirement 2.5: no `any` type annotation. */
function anyViolations(file: SourceText): Violation[] {
  const sf = parseSource(file);
  return findAll(sf, (n) => n.kind === ts.SyntaxKind.AnyKeyword).map((n) =>
    violation(file.path, lineOfNode(sf, n), "`any` type annotation"),
  );
}

function isDefaultExport(n: ts.Node): boolean {
  if (ts.isExportAssignment(n)) return n.isExportEquals !== true;
  if (
    ts.isExportDeclaration(n) &&
    n.exportClause !== undefined &&
    ts.isNamedExports(n.exportClause)
  ) {
    return n.exportClause.elements.some((e) => e.name.text === "default");
  }
  const modifiers = ts.canHaveModifiers(n) ? (ts.getModifiers(n) ?? []) : [];
  return (
    modifiers.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) &&
    modifiers.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword)
  );
}

/** Requirement 2.5: `export default` only in Next `page`, `layout` and `route` files, and no starter-kit import. */
function exportAndImportViolations(file: SourceText): Violation[] {
  const sf = parseSource(file);
  const found: Violation[] = [];
  if (!NEXT_ROUTE_FILE.test(file.path)) {
    for (const n of findAll(sf, isDefaultExport)) {
      found.push(
        violation(file.path, lineOfNode(sf, n), "export default outside page, layout, route"),
      );
    }
  }
  for (const ref of importsOf(file)) {
    if (ref.spec.startsWith("@tiptap/starter-kit")) {
      found.push(violation(file.path, ref.line, "import of @tiptap/starter-kit"));
    }
  }
  return found;
}

/** Requirement 2.6: `fetch(` only in the client API, the server deps and the Tier 2 provider files. */
function fetchViolations(file: SourceText): Violation[] {
  if (FETCH_OWNERS.test(file.path)) return [];
  const sf = parseSource(file);
  return collect(sf, ts.isCallExpression)
    .filter((c) => {
      const callee = c.expression;
      return (
        (ts.isIdentifier(callee) && callee.text === "fetch") ||
        (ts.isPropertyAccessExpression(callee) && callee.name.text === "fetch")
      );
    })
    .map((c) => violation(file.path, lineOfNode(sf, c), "fetch( call outside the allowed files"));
}

/** Requirements 3.12 and 7.7: no ambient clock in the store modules and the editor; no `AI>HUM` record. */
function clockViolations(file: SourceText): Violation[] {
  if (!CLOCK_FREE.test(file.path)) return [];
  const sf = parseSource(file);
  const found: Violation[] = [];
  for (const c of collect(sf, ts.isCallExpression)) {
    const e = c.expression;
    if (
      ts.isPropertyAccessExpression(e) &&
      e.expression.getText(sf) === "Date" &&
      e.name.text === "now"
    ) {
      found.push(violation(file.path, lineOfNode(sf, c), "Date.now() instead of the injected now"));
    }
  }
  for (const n of collect(sf, ts.isNewExpression)) {
    if (n.expression.getText(sf) === "Date" && (n.arguments ?? []).length === 0) {
      found.push(violation(file.path, lineOfNode(sf, n), "new Date() without arguments"));
    }
  }
  return found;
}

function originViolations(file: SourceText): Violation[] {
  const sf = parseSource(file);
  const found = collect(sf, ts.isPropertyAssignment)
    .filter(
      (p) =>
        p.name.getText(sf).replace(/["']/g, "") === "origin" &&
        ts.isStringLiteralLike(p.initializer) &&
        p.initializer.text === "AI>HUM",
    )
    .map((p) =>
      violation(file.path, lineOfNode(sf, p), "provenance record constructed with AI>HUM"),
    );
  if (!file.path.startsWith("src/editor/")) return found;
  const literals = textLiterals(file).filter((l) => l.text.includes("AI>HUM"));
  return [
    ...found,
    ...literals.map((l) => violation(file.path, l.line, "AI>HUM literal in the editor")),
  ];
}

/** Requirements 24.3 and 19.4: provider SDKs only in the adapters; no DOCX, PDF or download code. */
function libraryViolations(file: SourceText): Violation[] {
  const sf = parseSource(file);
  const found: Violation[] = [];
  for (const ref of importsOf(file)) {
    if (SDK_SPEC.test(ref.spec) && !SDK_ADAPTERS.test(file.path)) {
      found.push(
        violation(file.path, ref.line, `provider SDK import ${ref.spec} outside the adapters`),
      );
    }
    if (EXPORT_LIBS.test(ref.spec)) {
      found.push(violation(file.path, ref.line, `export library import ${ref.spec}`));
    }
  }
  for (const n of collect(sf, ts.isPropertyAccessExpression)) {
    if (n.name.text === "createObjectURL" && file.path !== DOWNLOAD_OWNER) {
      found.push(violation(file.path, lineOfNode(sf, n), "createObjectURL (download code)"));
    }
  }
  for (const a of collect(sf, ts.isJsxAttribute)) {
    if (a.name.getText(sf) === "download") {
      found.push(violation(file.path, lineOfNode(sf, a), "download attribute"));
    }
  }
  return found;
}

/** Requirement 25.7: tests never mock the Engine or the Verifier. */
function mockViolations(file: SourceText): Violation[] {
  const sf = parseSource(file);
  return collect(sf, ts.isCallExpression)
    .filter((c) => {
      const e = c.expression;
      const arg = c.arguments[0];
      return (
        ts.isPropertyAccessExpression(e) &&
        e.expression.getText(sf) === "vi" &&
        ["mock", "doMock"].includes(e.name.text) &&
        arg !== undefined &&
        ts.isStringLiteralLike(arg) &&
        ENGINE_OR_VERIFIER.test(arg.text)
      );
    })
    .map((c) => violation(file.path, lineOfNode(sf, c), "vi.mock of the Engine or the Verifier"));
}

function appChecks(file: SourceText): Violation[] {
  return [
    ...anyViolations(file),
    ...exportAndImportViolations(file),
    ...fetchViolations(file),
    ...clockViolations(file),
    ...originViolations(file),
    ...libraryViolations(file),
  ];
}

/**
 * These two tests read and scan every source file synchronously. Alone that takes about 0.3 s,
 * but the full run starts one worker per test file and the scan can pass the 5 s default on a
 * loaded machine. The longer limit changes no assertion.
 */
const SCAN_TIMEOUT_MS = 30_000;

describe("static: forbidden constructs _Requirements: 2.5, 2.6, 3.12, 7.7, 19.4, 24.3, 25.7_", () => {
  it(
    "finds none in src and app",
    () => {
      expect(formatViolations(readSources(["src", "app"]).flatMap(appChecks))).toEqual([]);
    },
    SCAN_TIMEOUT_MS,
  );

  it(
    "never mocks the Engine or the Verifier in tests",
    () => {
      expect(formatViolations(readSources(["test"]).flatMap(mockViolations))).toEqual([]);
    },
    SCAN_TIMEOUT_MS,
  );
});

function reported(check: (f: SourceText) => Violation[], path: string, text: string): string[] {
  return formatViolations(check({ path, text }));
}

describe("static: forbidden constructs self-test (planted violations)", () => {
  it("reports any, default exports and starter-kit with path and line", () => {
    const text = 'import { x } from "@tiptap/starter-kit";\nconst a: any = 1;\nexport default a;\n';
    expect(reported(appChecks, "src/bad.ts", text)).toEqual([
      "src/bad.ts:2 `any` type annotation",
      "src/bad.ts:3 export default outside page, layout, route",
      "src/bad.ts:1 import of @tiptap/starter-kit",
    ]);
  });

  it("allows export default in a Next page and the word any in comments", () => {
    const text = "// any\nexport default function Page() { return null; }\n";
    expect(reported(appChecks, "app/page.tsx", text)).toEqual([]);
  });

  it("reports fetch( outside the owners and allows it inside", () => {
    const text = 'const a = 1;\nawait fetch("/x");\n';
    expect(reported(fetchViolations, "src/components/x.ts", text)).toEqual([
      "src/components/x.ts:2 fetch( call outside the allowed files",
    ]);
    expect(reported(fetchViolations, "src/client/api.ts", text)).toEqual([]);
    expect(reported(fetchViolations, "src/server/llm-bedrock.ts", text)).toEqual([]);
  });

  it("reports Date.now and new Date() in store modules only", () => {
    const text = "const a = Date.now();\nconst b = new Date();\nconst c = new Date(0);\n";
    expect(reported(clockViolations, "src/store.ts", text)).toEqual([
      "src/store.ts:1 Date.now() instead of the injected now",
      "src/store.ts:2 new Date() without arguments",
    ]);
    expect(reported(clockViolations, "src/server/deps.ts", text)).toEqual([]);
  });

  it("reports an AI>HUM record, and any AI>HUM literal in the editor", () => {
    const record = 'const p = { origin: "AI>HUM", runId: "r" };\n';
    expect(reported(originViolations, "src/store.ts", record)).toEqual([
      "src/store.ts:1 provenance record constructed with AI>HUM",
    ]);
    const literal = 'const n = "AI>HUM";\n';
    expect(reported(originViolations, "src/editor/x.ts", literal)).toEqual([
      "src/editor/x.ts:1 AI>HUM literal in the editor",
    ]);
    expect(reported(originViolations, "src/pane/layout.ts", literal)).toEqual([]);
  });

  it("reports provider SDK, export library and download code", () => {
    const text =
      'import { streamText } from "ai";\nimport { Document } from "docx";\nconst u = URL.createObjectURL(b);\n';
    expect(reported(libraryViolations, "src/components/x.tsx", text)).toEqual([
      "src/components/x.tsx:1 provider SDK import ai outside the adapters",
      "src/components/x.tsx:2 export library import docx",
      "src/components/x.tsx:3 createObjectURL (download code)",
    ]);
    expect(
      reported(libraryViolations, "src/client/download.ts", "const u = URL.createObjectURL(b);\n"),
    ).toEqual([]);
    expect(
      reported(libraryViolations, "src/client/other.ts", "const u = URL.createObjectURL(b);\n"),
    ).toEqual(["src/client/other.ts:1 createObjectURL (download code)"]);
    expect(
      reported(
        libraryViolations,
        "src/server/llm-bedrock.ts",
        'import { streamText } from "ai";\n',
      ),
    ).toEqual([]);
    expect(
      reported(
        libraryViolations,
        "src/server/llm-default.ts",
        'import { streamText } from "ai";\n',
      ),
    ).toEqual([]);
    expect(
      reported(libraryViolations, "src/server/llm.ts", 'import { streamText } from "ai";\n'),
    ).toEqual(["src/server/llm.ts:1 provider SDK import ai outside the adapters"]);
  });

  it("reports vi.mock of the Engine and the Verifier but not of other modules", () => {
    const text =
      'vi.mock("@reveal-codes/engine");\nvi.mock("../../../packages/verifier/src/index.js");\nvi.mock("./other");\n';
    expect(reported(mockViolations, "test/a.test.ts", text)).toEqual([
      "test/a.test.ts:1 vi.mock of the Engine or the Verifier",
      "test/a.test.ts:2 vi.mock of the Engine or the Verifier",
    ]);
  });
});
