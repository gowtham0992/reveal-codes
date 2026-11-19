import { describe, expect, it } from "vitest";
import { isBuiltInExcluded } from "../src/core/exclude.js";
import { isIgnored } from "../src/core/ignore.js";
import { parseIgnore } from "../src/core/ignore-parse.js";

type Rule = { rule: string; matches: string[]; nearMisses: string[] };

const RULES: readonly Rule[] = [
  {
    rule: "Record_Directory",
    matches: [".kiro/provenance/records/a.json", ".kiro/provenance/ignore"],
    nearMisses: [".kiro/provenance-notes.md", ".kiro/steering/tech.md", "src/.kiro/provenance/x"],
  },
  {
    rule: "lockfiles",
    matches: ["package-lock.json", "pnpm-lock.yaml", "yarn.lock", "bun.lock", "Cargo.lock"],
    nearMisses: ["package.json", "lock.ts", "locks/a.ts", "pnpm-lock.yaml.md"],
  },
  {
    rule: "more lockfiles",
    matches: ["Gemfile.lock", "poetry.lock", "composer.lock", "go.sum", "a/b/go.sum", "x.lock"],
    nearMisses: ["go.mod", "go.sum.txt", "sum.go", "a.lockfile"],
  },
  {
    rule: "*.min.js",
    matches: ["a.min.js", "src/vendor/lib.min.js"],
    nearMisses: ["a.js", "min.js", "a.min.jsx"],
  },
  {
    rule: "*.min.css",
    matches: ["a.min.css", "styles/site.min.css"],
    nearMisses: ["a.css", "min.css", "a.min.cs"],
  },
  {
    rule: "*.map",
    matches: ["a.js.map", "x/y.map"],
    nearMisses: ["a.mapx", "map.ts", "maps/a.ts"],
  },
  {
    rule: "output directories",
    matches: [
      "dist/a.js",
      "x/build/a.ts",
      "out/a",
      "apps/web/.next/a",
      "coverage/lcov",
      "target/a.rs",
    ],
    nearMisses: [
      "distinct/a.ts",
      "src/build.ts",
      "outputs/a",
      "next/a",
      "src/dist.ts",
      "a/targets/b",
    ],
  },
  {
    rule: ".env",
    matches: [".env", "apps/web/.env", ".env.local", ".env.production"],
    nearMisses: [".envrc", "env", ".environment", "a.env", ".env-example"],
  },
  {
    rule: "key files",
    matches: ["a.pem", "k/b.key", "c.p12", "d.pfx"],
    nearMisses: ["a.pem.md", "key.ts", "a.keys", "p12", "a.pfxx"],
  },
  {
    rule: "ssh keys",
    matches: ["id_rsa", "id_rsa.pub", "home/id_ed25519", "id_ed25519_work"],
    nearMisses: ["my_id_rsa", "id_dsa", "id_ed2551", "rsa_id"],
  },
];

describe("isBuiltInExcluded", () => {
  for (const { rule, matches, nearMisses } of RULES) {
    it(`${rule}: excludes its matches and keeps its near misses`, () => {
      expect(matches.filter((p) => !isBuiltInExcluded(p))).toEqual([]);
      expect(nearMisses.filter((p) => isBuiltInExcluded(p))).toEqual([]);
    });
  }

  it("a `!` pattern in an ignore file does not change the built-in verdict", () => {
    const rules = parseIgnore("!.env\n!dist/a.js\n");
    for (const path of [".env", "dist/a.js"]) {
      expect(isIgnored(rules, path)).toBe(false);
      expect(isBuiltInExcluded(path)).toBe(true);
    }
  });
});
