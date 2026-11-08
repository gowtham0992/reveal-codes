import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { WEB_ROOT } from "../support/scan";

const REPO_ROOT = join(WEB_ROOT, "..", "..");

function repoFile(...parts: string[]): string {
  return readFileSync(join(REPO_ROOT, ...parts), "utf8");
}

/** Variables read through `env["NAME"]` or `env.NAME` in the one module that reads the environment. */
export function variablesRead(source: string): string[] {
  const names = new Set<string>();
  for (const match of source.matchAll(/\benv\[\s*"([A-Z][A-Z0-9_]*)"\s*\]/g)) {
    if (match[1] !== undefined) names.add(match[1]);
  }
  for (const match of source.matchAll(/\benv\.([A-Z][A-Z0-9_]*)\b/g)) {
    if (match[1] !== undefined) names.add(match[1]);
  }
  return [...names].sort();
}

type EnvEntry = { name: string; previous: string | undefined };

export function envEntries(text: string): EnvEntry[] {
  const lines = text.split("\n");
  const entries: EnvEntry[] = [];
  lines.forEach((line, index) => {
    const match = /^([A-Z][A-Z0-9_]*)=/.exec(line);
    if (match?.[1] !== undefined) entries.push({ name: match[1], previous: lines[index - 1] });
  });
  return entries;
}

const readme = repoFile("README.md");
const envExample = repoFile(".env.example");
const depsSource = readFileSync(join(WEB_ROOT, "src", "server", "deps.ts"), "utf8");

function section(markdown: string, heading: string): string {
  const start = markdown.indexOf(`## ${heading}`);
  if (start < 0) return "";
  const rest = markdown.slice(start + heading.length + 3);
  const end = rest.search(/\n## /);
  return end < 0 ? rest : rest.slice(0, end);
}

describe("docs: README _Requirements: 26.1_", () => {
  const leaves = section(readme, "What leaves your machine");

  it("has the section", () => {
    expect(leaves).not.toBe("");
  });

  it("states what Verify sends and that quotation text is checked in the browser and never sent", () => {
    expect(leaves).toMatch(/Verify sends only citation records to this app's own server/);
    expect(leaves).toMatch(/from there only citation strings go to CourtListener/);
    expect(leaves).toMatch(/Quotation text is checked in the browser/);
    expect(leaves).toMatch(/never sent/);
  });

  it("states what Draft sends to the configured provider, and no telemetry", () => {
    expect(leaves).toMatch(
      /sends the prompt and the paragraph at the cursor to the configured LLM provider/,
    );
    expect(leaves).toMatch(/no telemetry/i);
  });

  it("states the token requirement and demo mode", () => {
    expect(leaves).toMatch(/token is required for live lookups/);
    expect(leaves).toMatch(/demo mode on recorded responses/);
  });

  it("explains how to run, the demo path and the webpack note", () => {
    expect(readme).toContain("pnpm install");
    expect(readme).toContain("pnpm dev");
    expect(section(readme, "Demo path")).toMatch(
      /Load demo motion[\s\S]*Alt-F3[\s\S]*Verify[\s\S]*Export/,
    );
    expect(readme).toMatch(/Turbopack/);
    expect(readme).toContain("--webpack");
  });

  it("has no exclamation mark", () => {
    expect(readme).not.toContain("!");
  });
});

describe("docs: .env.example _Requirements: 26.2, 26.3_", () => {
  const entries = envEntries(envExample);
  const names = entries.map((entry) => entry.name).sort();

  it("lists every variable src/server/deps.ts reads and no other", () => {
    const read = variablesRead(depsSource);
    expect(read.length).toBeGreaterThan(0);
    expect(names).toEqual(read);
  });

  it("lists the variables the task names", () => {
    for (const name of [
      "COURTLISTENER_TOKEN",
      "COURTLISTENER_BASE_URL",
      "REVEAL_CODES_CACHE_DIR",
      "REVEAL_CODES_FIXTURES_ONLY",
      "AWS_REGION",
      "BEDROCK_MODEL_ID",
      "ANTHROPIC_API_KEY",
      "ANTHROPIC_MODEL",
    ]) {
      expect(names).toContain(name);
    }
  });

  it("puts a comment line directly before every variable", () => {
    for (const entry of entries) {
      expect(entry.previous?.startsWith("# "), entry.name).toBe(true);
    }
  });

  it("sets no values", () => {
    expect(envExample).not.toMatch(/^[A-Z][A-Z0-9_]*=.+$/m);
  });

  it("says the token is required for live lookups and demo mode runs on recorded responses", () => {
    expect(envExample).toMatch(/Required for live lookups/);
    expect(envExample).toMatch(/demo mode on recorded responses/);
  });

  it("has no exclamation mark", () => {
    expect(envExample).not.toContain("!");
  });
});

function docsAndConfigFiles(): string[] {
  const files = [".env.example", "README.md", "package.json", "apps/web/package.json"];
  const docs = join(REPO_ROOT, "docs");
  if (existsSync(docs)) {
    for (const name of readdirSync(docs)) if (name.endsWith(".md")) files.push(`docs/${name}`);
  }
  const workflows = join(REPO_ROOT, ".github", "workflows");
  if (existsSync(workflows)) {
    for (const name of readdirSync(workflows)) files.push(`.github/workflows/${name}`);
  }
  return files;
}

describe("docs: no provider switch and no model id literal _Requirements: 26.3_", () => {
  it("does not mention LLM_PROVIDER in the repository's docs and config", () => {
    const hits = docsAndConfigFiles().filter((file) => repoFile(file).includes("LLM_PROVIDER"));
    expect(hits).toEqual([]);
  });

  it("has no model id literal in the README, .env.example or docs", () => {
    const modelId =
      /\b(?:anthropic\.claude|claude-[a-z0-9]|us\.anthropic|eu\.anthropic|amazon\.(?:nova|titan))/i;
    const hits = docsAndConfigFiles().filter((file) => modelId.test(repoFile(file)));
    expect(hits).toEqual([]);
  });
});

describe("docs: hook and test project exist _Requirements: 1.5, 2.1_", () => {
  it("has the web-tests-on-save hook", () => {
    expect(existsSync(join(REPO_ROOT, ".kiro", "hooks", "web-tests-on-save.json"))).toBe(true);
  });

  it("registers the web project in the root vitest config", () => {
    expect(repoFile("vitest.config.ts")).toMatch(/project\("web"|name:\s*"web"|\bWEB\b/);
  });
});
