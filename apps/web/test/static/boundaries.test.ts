import { posix } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import {
  collect,
  formatViolations,
  importsOf,
  lineOfNode,
  parseSource,
  readSources,
  violation,
  type ImportRef,
  type SourceText,
  type Violation,
} from "../support/scan";

/** The import-boundary table of the design (Requirements 2.9, 16.7), as one check per module group. */
type Check = (ref: ImportRef, file: SourceText) => string | null;

const VERIFIER = "@reveal-codes/verifier";
const DOM_GLOBALS = new Set([
  "window",
  "localStorage",
  "sessionStorage",
  "navigator",
  "HTMLElement",
]);
const DOM_DOCUMENT_MEMBERS = new Set([
  "createElement",
  "getElementById",
  "querySelector",
  "body",
  "addEventListener",
]);

const STATE_MODULES =
  /^src\/(?:store|history|store-runtime|persist|autosave|notices|pane-preference)\.ts$/;
const LAYOUT_MODULE = /^src\/pane\/(?:layout|failing|closers|blocks)\.ts$/;
const EDITOR_PURE = /^src\/editor\/(?:offsets|slice-text|transaction-ops|schema|marks)\.ts$/;
const ROUTE_FILE = /^app\/api\/.*route\.ts$/;

function target(file: SourceText, ref: ImportRef): string | null {
  if (!ref.spec.startsWith(".")) return null;
  return posix.normalize(posix.join(posix.dirname(file.path), ref.spec));
}

function intoDir(file: SourceText, ref: ImportRef, dirs: readonly string[]): string | null {
  const t = target(file, ref);
  const hit = dirs.find((d) => t !== null && (t === d || t.startsWith(`${d}/`)));
  return hit === undefined ? null : `${hit}/`;
}

const isReact = (s: string): boolean =>
  /^(?:react|react-dom|next|@testing-library)(?:\/|$)/.test(s);
const isTiptap = (s: string): boolean => s.startsWith("@tiptap/");

const noReact: Check = (ref) => (isReact(ref.spec) ? "React or Next" : null);
const noTiptap: Check = (ref) => (isTiptap(ref.spec) ? "TipTap" : null);
const noServer: Check = (ref, file) =>
  intoDir(file, ref, ["src/server"]) !== null ? "server/" : null;
const noClient: Check = (ref, file) =>
  intoDir(file, ref, ["src/client"]) !== null ? "client/" : null;
const noClientSide: Check = (ref, file) =>
  intoDir(file, ref, ["src/client", "src/components", "src/editor", "src/pane"]) === null
    ? null
    : "client-side modules";

/** `client/*` takes the browser-safe `/quote` and `/link` subpaths and types from the root. */
const verifierSubpathOnly: Check = (ref) => {
  if (ref.spec === VERIFIER) return ref.typeOnly ? null : `${VERIFIER} at its root for a value`;
  if (
    ref.spec.startsWith(`${VERIFIER}/`) &&
    ref.spec !== `${VERIFIER}/quote` &&
    ref.spec !== `${VERIFIER}/link`
  ) {
    return ref.spec;
  }
  return null;
};

/** Requirement 2.9: nothing bundled for the browser imports the Verifier root (value) or `node:*`. */
const browserBundle: Check = (ref) => {
  if (ref.spec.startsWith("node:")) return "node:* in a browser module";
  return ref.spec === VERIFIER && !ref.typeOnly ? `${VERIFIER} at its root for a value` : null;
};

const routeImports: Check = (ref, file) => {
  if (ref.spec === "next/server" || intoDir(file, ref, ["src/server"]) !== null) return null;
  return "anything but server/ and next/server";
};

const COURTS_PAGE = /^app\/courts\//;
/** Requirements 16.10, 16.14: the Courts page imports only from `src/`, its own folder or packages. */
const courtsPageImports: Check = (ref, file) => {
  const t = target(file, ref);
  if (t === null || t.startsWith("src/") || t.startsWith("app/courts/")) return null;
  return "anything but src/, app/courts/ and packages";
};
function checksFor(path: string): Check[] {
  const checks: Check[] = [];
  const inServer = path.startsWith("src/server/") || path.startsWith("app/api/");
  if (!inServer && /^(?:src|app)\//.test(path)) checks.push(browserBundle);
  if (STATE_MODULES.test(path)) checks.push(noReact, noTiptap, noServer, noClient);
  if (LAYOUT_MODULE.test(path)) checks.push(noReact, noTiptap, noServer);
  if (EDITOR_PURE.test(path)) checks.push(noReact, noServer);
  if (path.startsWith("src/client/")) checks.push(verifierSubpathOnly, noServer);
  if (path.startsWith("src/server/")) checks.push(noReact, noTiptap, noClientSide);
  if (/^src\/(?:components|editor)\//.test(path)) checks.push(noServer);
  if (ROUTE_FILE.test(path)) checks.push(routeImports);
  if (COURTS_PAGE.test(path)) checks.push(courtsPageImports);
  if (path.startsWith("src/courts/")) checks.push(noServer);
  return checks;
}

function importViolations(file: SourceText): Violation[] {
  const checks = checksFor(file.path);
  return importsOf(file).flatMap((ref) =>
    checks.flatMap((check) => {
      const why = check(ref, file);
      return why === null
        ? []
        : [violation(file.path, ref.line, `imports ${ref.spec}: not allowed (${why})`)];
    }),
  );
}

function isDeclarationName(n: ts.Identifier): boolean {
  return (n.parent as { name?: ts.Node }).name === n;
}

/** Pure modules touch no DOM global. A local called `document` is the Engine's Document, so only DOM members count. */
function domGlobalViolations(file: SourceText): Violation[] {
  if (!STATE_MODULES.test(file.path) && !EDITOR_PURE.test(file.path)) return [];
  const sf = parseSource(file);
  return collect(sf, ts.isIdentifier)
    .filter((n) => {
      if (DOM_GLOBALS.has(n.text)) return !isDeclarationName(n);
      const parent = n.parent;
      return (
        n.text === "document" &&
        ts.isPropertyAccessExpression(parent) &&
        parent.expression === n &&
        DOM_DOCUMENT_MEMBERS.has(parent.name.text)
      );
    })
    .map((n) => violation(file.path, lineOfNode(sf, n), `DOM global ${n.text} in a pure module`));
}

function allChecks(file: SourceText): Violation[] {
  return [...importViolations(file), ...domGlobalViolations(file)];
}

describe("static: import boundaries _Requirements: 2.9, 16.7_", () => {
  it("keeps every module inside the import-boundary table", () => {
    expect(formatViolations(readSources(["src", "app"]).flatMap(allChecks))).toEqual([]);
  });
});

function reported(path: string, text: string): string[] {
  return formatViolations(allChecks({ path, text }));
}

describe("static: boundaries self-test (planted violations)", () => {
  it("reports React and server imports in the store, with path and line", () => {
    const text =
      'import { reduce } from "./history";\nimport { useState } from "react";\nimport { d } from "./server/deps";\n';
    expect(reported("src/store.ts", text)).toEqual([
      "src/store.ts:2 imports react: not allowed (React or Next)",
      "src/store.ts:3 imports ./server/deps: not allowed (server/)",
    ]);
  });

  it("reports a Verifier root value import and node:* in a browser module, but not a type import", () => {
    const text =
      'import { lookup } from "@reveal-codes/verifier";\nimport type { Result } from "@reveal-codes/verifier";\nimport { readFile } from "node:fs";\n';
    expect(reported("src/components/x.tsx", text)).toEqual([
      "src/components/x.tsx:1 imports @reveal-codes/verifier: not allowed (@reveal-codes/verifier at its root for a value)",
      "src/components/x.tsx:3 imports node:fs: not allowed (node:* in a browser module)",
    ]);
  });

  it("allows server modules to import the Verifier and node:*, and client modules the quote subpath", () => {
    const server =
      'import { lookup } from "@reveal-codes/verifier";\nimport { x } from "node:fs";\n';
    expect(reported("src/server/deps.ts", server)).toEqual([]);
    const client = 'import { checkQuote } from "@reveal-codes/verifier/quote";\n';
    expect(reported("src/client/divergence.ts", client)).toEqual([]);
    const other = 'import { x } from "@reveal-codes/verifier/other";\n';
    expect(reported("src/client/api.ts", other)).toHaveLength(1);
  });

  it("reports a route file importing anything but server/, and a component importing server/", () => {
    const route =
      'import { handle } from "../../../src/server/verify-route";\nimport { x } from "../../../src/store";\n';
    expect(reported("app/api/verify/route.ts", route)).toEqual([
      "app/api/verify/route.ts:2 imports ../../../src/store: not allowed (anything but server/ and next/server)",
    ]);
    expect(reported("src/components/a.tsx", 'import { d } from "../server/deps";\n')).toEqual([
      "src/components/a.tsx:1 imports ../server/deps: not allowed (server/)",
    ]);
  });

  it("reports a Courts page import from outside src/ and a courts module importing server/", () => {
    const page =
      'import { x } from "../api/verify/route";\nimport { y } from "../../src/courts/hash";\n';
    expect(reported("app/courts/page.tsx", page)).toEqual([
      "app/courts/page.tsx:1 imports ../api/verify/route: not allowed (anything but src/, app/courts/ and packages)",
    ]);
    expect(reported("src/courts/x.ts", 'import { d } from "../server/deps";\n')).toEqual([
      "src/courts/x.ts:1 imports ../server/deps: not allowed (server/)",
    ]);
  });
  it("reports TipTap in pane/layout.ts and server modules importing client-side code", () => {
    expect(reported("src/pane/layout.ts", 'import { Editor } from "@tiptap/core";\n')).toHaveLength(
      1,
    );
    const text = 'import { a } from "../components/app-shell";\n';
    expect(reported("src/server/x.ts", text)).toEqual([
      "src/server/x.ts:1 imports ../components/app-shell: not allowed (client-side modules)",
    ]);
  });

  it("reports DOM globals in pure modules but not a local named document", () => {
    const text =
      "const a = window.innerWidth;\nconst b = document.text;\nconst c = document.createElement('p');\n";
    expect(reported("src/editor/offsets.ts", text)).toEqual([
      "src/editor/offsets.ts:1 DOM global window in a pure module",
      "src/editor/offsets.ts:3 DOM global document in a pure module",
    ]);
  });
});
