// Builds the generated files of the citation-check Power: the one-file server, the verifier
// fixtures and the standing-orders dataset copy. Deterministic: the same sources give the same bytes.
// Usage: node scripts/build-power.mjs [out-dir]   (default: powers/citation-check)
import { build } from "esbuild";
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const out = resolve(process.argv[2] ?? join(root, "powers", "citation-check"));
const SERVER = join(out, "server", "courtlistener-mcp.mjs");
const FIXTURES = join(out, "server", "fixtures");
const DATASET = join(out, "skills", "court-ai-rules", "references", "standing-orders.json");
// Some bundled CommonJS dependencies call require(); ESM output has no require of its own.
const BANNER =
  'import { createRequire as __createRequire } from "node:module";\nconst require = __createRequire(import.meta.url);';
const result = await build({
  absWorkingDir: root,
  entryPoints: ["packages/courtlistener-mcp/src/main.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  write: false,
  logLevel: "warning",
  legalComments: "none",
  define: { REVEAL_CODES_POWER: "true" },
  banner: { js: BANNER },
  outfile: SERVER,
});
const file = result.outputFiles[0];
if (file === undefined) throw new Error("esbuild produced no output");
mkdirSync(dirname(SERVER), { recursive: true });
writeFileSync(SERVER, file.contents);
rmSync(FIXTURES, { recursive: true, force: true });
cpSync(join(root, "packages", "verifier", "fixtures"), FIXTURES, { recursive: true });
mkdirSync(dirname(DATASET), { recursive: true });
writeFileSync(DATASET, readFileSync(join(root, "data", "standing-orders.json")));
console.log(`built ${SERVER}`);
