import fc from "fast-check";
import { describe, it } from "vitest";
import { parseIgnore } from "../src/core/ignore-parse.js";
import { isIgnored } from "../src/core/ignore.js";
import { arbIgnoreContents, arbIgnorePaths } from "../src/testing/arbitraries.js";
import { runs } from "./support/fc.js";
import { gitAvailable, gitIgnoredPaths } from "./support/git-ignore.js";

const HAS_GIT = gitAvailable();

describe("ignore matcher properties _Requirements: 2.8, 2.9, 16.21_", () => {
  // Property 15
  it.skipIf(!HAS_GIT)(
    "P15 the matcher agrees with git check-ignore --no-index (skipped where git is not on the path)",
    () => {
      fc.assert(
        fc.property(arbIgnoreContents, arbIgnorePaths, (contents, paths) => {
          const rules = parseIgnore(contents);
          const byGit = gitIgnoredPaths(contents, paths);
          const disagreements = paths.filter((p) => isIgnored(rules, p) !== byGit.has(p));
          return disagreements.length === 0;
        }),
        { numRuns: runs(process.env) },
      );
    },
    120_000,
  );
});
