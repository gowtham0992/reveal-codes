import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

type CopyResult = Readonly<{ ok: true; value: undefined }> | Readonly<{ ok: false; error: string }>;

const HERE = dirname(fileURLToPath(import.meta.url));
const DEFAULT_SRC = resolve(HERE, "../../../packages/engine/fixtures/demo-motion.txt");
const DEFAULT_DEST = resolve(HERE, "../public/demo-motion.txt");

/** Copies the demo motion byte for byte, creating the destination directory. */
export function copyDemo(src: string, dest: string): CopyResult {
  if (!existsSync(src)) return { ok: false, error: `Demo motion source is missing: ${src}` };
  mkdirSync(dirname(dest), { recursive: true });
  copyFileSync(src, dest);
  return { ok: true, value: undefined };
}

function main(argv: readonly string[]): number {
  const result = copyDemo(argv[0] ?? DEFAULT_SRC, argv[1] ?? DEFAULT_DEST);
  if (result.ok) return 0;
  process.stderr.write(`copy-demo: ${result.error}\n`);
  return 1;
}

const entry = process.argv[1];
if (entry !== undefined && resolve(entry) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
