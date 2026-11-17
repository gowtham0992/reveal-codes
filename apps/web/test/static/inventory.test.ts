import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { WEB_ROOT, walkFiles } from "../support/scan";

const REPO_ROOT = join(WEB_ROOT, "..", "..");

function repoText(...parts: string[]): string {
  return readFileSync(join(REPO_ROOT, ...parts), "utf8");
}

/** Repository-relative paths of the files directly inside `dir`. */
export function filesIn(dir: string): string[] {
  const full = join(REPO_ROOT, dir);
  if (!existsSync(full)) return [];
  return readdirSync(full)
    .filter((name) => statSync(join(full, name)).isFile())
    .sort()
    .map((name) => `${dir}/${name}`);
}

/** Every file under `.kiro/specs/<spec>/`, repository-relative. */
export function specFiles(): string[] {
  const specs = join(REPO_ROOT, ".kiro", "specs");
  return readdirSync(specs)
    .filter((name) => statSync(join(specs, name)).isDirectory())
    .flatMap((name) => filesIn(`.kiro/specs/${name}`));
}

/** Names of the directories directly under `dir`. */
export function directoriesIn(dir: string): string[] {
  return readdirSync(dir)
    .filter((name) => statSync(join(dir, name)).isDirectory())
    .sort();
}

/** Paths from `expected` that `text` does not mention. */
export function unlisted(text: string, expected: readonly string[]): string[] {
  return expected.filter((path) => !text.includes(path));
}

const usage = repoText("docs", "KIRO_USAGE.md");

describe("inventory: KIRO_USAGE lists the Kiro files _Requirements: 26.4_", () => {
  it("lists every hook by path", () => {
    const hooks = filesIn(".kiro/hooks");
    expect(hooks.length).toBeGreaterThan(0);
    expect(unlisted(usage, hooks)).toEqual([]);
  });

  it("lists every steering file by path", () => {
    const steering = filesIn(".kiro/steering");
    expect(steering.length).toBeGreaterThan(0);
    expect(unlisted(usage, steering)).toEqual([]);
  });

  it("lists every file of every spec directory by path", () => {
    const files = specFiles();
    expect(files.length).toBeGreaterThan(0);
    expect(unlisted(usage, files)).toEqual([]);
  });

  it("has rows for the editor-app spec and the web-tests-on-save hook", () => {
    expect(usage).toMatch(
      /^\| Spec \| editor-app \| .*\.kiro\/specs\/editor-app\/requirements\.md/m,
    );
    expect(usage).toMatch(/^\| Hook \| .* \| .*\.kiro\/hooks\/web-tests-on-save\.json/m);
  });

  it("reports a missing path (self-test)", () => {
    expect(unlisted("a/b.md and c/d.md", ["a/b.md", "e/f.md"])).toEqual(["e/f.md"]);
  });
});

describe("inventory: structure.md covers apps/web/src _Requirements: 26.6_", () => {
  const structure = repoText(".kiro", "steering", "structure.md");
  const topLevel = directoriesIn(join(WEB_ROOT, "src"));

  it("finds the source directories", () => {
    expect(topLevel).toEqual(
      expect.arrayContaining(["client", "components", "editor", "pane", "server"]),
    );
  });

  it("mentions apps/web/src and each top-level directory under it", () => {
    expect(structure).toContain("apps/web/src");
    const missing = topLevel.filter((name) => !structure.includes(`${name}/`));
    expect(missing).toEqual([]);
  });

  it("no longer describes the removed component, lib and demo directories", () => {
    expect(structure).not.toMatch(/components\/editor|components\/assistant|lib\/llm|lib\/export/);
    expect(structure).not.toMatch(/^\s+demo\/\s/m);
  });
});

describe("inventory: BUILD_LOG has an editor-app entry _Requirements: 26.5_", () => {
  it("has a dated heading", () => {
    expect(repoText("BUILD_LOG.md")).toMatch(/^## \d{4}-\d{2}-\d{2} editor-app$/m);
  });
});

describe("inventory: properties _Requirements: 25.1, 25.2, 25.3, 25.4, 25.5, 25.7_", () => {
  // case-match.properties.test.ts is checked by the aggregate case-match-inventory.test.ts (task 13.6).
  // declaration-clearing.properties.test.ts holds Property 4 of the pasted-text-declaration spec,
  // whose numbering is its own; that spec's design.md lists it.
  const files = walkFiles(join(WEB_ROOT, "test"), /\.properties\.test\.ts$/).filter(
    (f) =>
      !f.endsWith("case-match.properties.test.ts") &&
      !f.endsWith("declaration-clearing.properties.test.ts"),
  );
  const texts = files.map((file) => readFileSync(file, "utf8"));

  // Property numbers are per spec: editor-app has 1 to 5, first-run-and-flow adds its own Property 1
  // in next-step.properties.test.ts, and the deploy-readiness limiter property is Property 1 in
  // rate-limit.properties.test.ts, and legal-record-ui adds its Property 1 in
  // css-tokens.properties.test.ts, and open-draft adds its Properties 5, 6 and 7 in
  // next-step-gap.properties.test.ts, and Properties 10, 11, 13 and 14 in open-file.properties.test.ts,
  // and citation-check-page adds Property 1 in check-rows.properties.test.ts and Property 2 in
  // check-request.properties.test.ts.
  it("has exactly seventeen properties: editor-app 1 to 5, first-run-and-flow 1, the limiter 1, legal-record-ui 1, open-draft 5, 6, 7, 10, 11, 13 and 14, and citation-check-page 1 and 2", () => {
    const numbers = texts.flatMap((t) => [...t.matchAll(/^\s*\/\/ Property (\d+)$/gm)]);
    expect(numbers.map((m) => m[1]).sort()).toEqual([
      "1",
      "1",
      "1",
      "1",
      "1",
      "10",
      "11",
      "13",
      "14",
      "2",
      "2",
      "3",
      "4",
      "5",
      "5",
      "6",
      "7",
    ]);
    expect(files.some((f) => f.endsWith("next-step.properties.test.ts"))).toBe(true);
    expect(files.some((f) => f.endsWith("rate-limit.properties.test.ts"))).toBe(true);
    expect(files.some((f) => f.endsWith("css-tokens.properties.test.ts"))).toBe(true);
    expect(files.some((f) => f.endsWith("next-step-gap.properties.test.ts"))).toBe(true);
    expect(files.some((f) => f.endsWith("open-file.properties.test.ts"))).toBe(true);
    expect(files.some((f) => f.endsWith("check-rows.properties.test.ts"))).toBe(true);
    expect(files.some((f) => f.endsWith("check-request.properties.test.ts"))).toBe(true);
  });

  it("has exactly one fc.assert per property, using runs()", () => {
    for (const text of texts) {
      const props = text.match(/^\s*\/\/ Property \d+$/gm)?.length;
      expect(text.match(/\bfc\.assert\(/g)?.length).toBe(props);
      expect(text).toMatch(/\{ numRuns: runs\(\) \}/);
      expect(text).not.toMatch(/numRuns:\s*\d/);
    }
  });

  it("ends every describe title with _Requirements: x.y_", () => {
    for (const text of texts) {
      const titles = [...text.matchAll(/\bdescribe\(\s*"([^"]*)"/g)].map((m) => m[1] ?? "");
      expect(titles.length).toBeGreaterThan(0);
      for (const title of titles) expect(title).toMatch(/_Requirements: [\d.]+(, [\d.]+)*_$/);
    }
  });

  it("keeps EditorView out of the ProseMirror property files", () => {
    const pm = files.filter((f) => /offsets|transaction-ops/.test(f));
    expect(pm).toHaveLength(2);
    for (const file of pm) expect(readFileSync(file, "utf8")).not.toContain("EditorView");
  });

  it("does not vi.mock the Engine or the Verifier outside the static scans", () => {
    const all = walkFiles(join(WEB_ROOT, "test"), /\.tsx?$/).filter(
      (f) => !f.includes("/test/static/"),
    );
    for (const file of all) {
      expect(readFileSync(file, "utf8"), file).not.toMatch(
        /vi\.mock\(\s*["']@reveal-codes\/(engine|verifier)/,
      );
    }
  });
});
