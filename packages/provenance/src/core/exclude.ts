/** The Record_Directory, relative to the Workspace_Root (Req 2.4). */
export const RECORD_DIRECTORY = ".kiro/provenance";

const LOCKFILE_NAMES: ReadonlySet<string> = new Set([
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "bun.lock",
  "Cargo.lock",
  "Gemfile.lock",
  "poetry.lock",
  "composer.lock",
  "go.sum",
]);

const OUTPUT_DIRECTORIES: ReadonlySet<string> = new Set([
  "dist",
  "build",
  "out",
  ".next",
  "coverage",
  "target",
]);

const GENERATED_SUFFIXES: readonly string[] = [".lock", ".min.js", ".min.css", ".map"];
const SECRET_SUFFIXES: readonly string[] = [".pem", ".key", ".p12", ".pfx"];
const SECRET_PREFIXES: readonly string[] = ["id_rsa", "id_ed25519"];

function underRecordDirectory(path: string): boolean {
  return path === RECORD_DIRECTORY || path.startsWith(`${RECORD_DIRECTORY}/`);
}

function endsWithAny(name: string, suffixes: readonly string[]): boolean {
  return suffixes.some((suffix) => name.endsWith(suffix));
}

function isGeneratedName(name: string): boolean {
  return LOCKFILE_NAMES.has(name) || endsWithAny(name, GENERATED_SUFFIXES);
}

function isSecretName(name: string): boolean {
  return (
    name === ".env" ||
    name.startsWith(".env.") ||
    endsWithAny(name, SECRET_SUFFIXES) ||
    SECRET_PREFIXES.some((prefix) => name.startsWith(prefix))
  );
}

/**
 * Whether the built-in rules of Req 2.4 to 2.7 exclude the file at `path` (workspace-relative,
 * `/` separated). No ignore file can re-include a path for which this returns true.
 */
export function isBuiltInExcluded(path: string): boolean {
  if (underRecordDirectory(path)) return true;
  const segments = path.split("/");
  const name = segments[segments.length - 1] ?? "";
  const directories = segments.slice(0, -1);
  if (directories.some((directory) => OUTPUT_DIRECTORIES.has(directory))) return true;
  return isGeneratedName(name) || isSecretName(name);
}
