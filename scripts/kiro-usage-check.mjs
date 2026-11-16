// Checks that docs/KIRO_USAGE.md and the Kiro files under .kiro/ agree.
// Usage: node scripts/kiro-usage-check.mjs [repo-root]
// Exit 1 with one line per gap; exit 0 with the row counts by kind.
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const root = process.argv[2] ?? process.cwd();
const USAGE = "docs/KIRO_USAGE.md";

/** Repository-relative paths of every file under `dir`, recursively, sorted. */
function filesUnder(dir) {
  const full = join(root, dir);
  if (!existsSync(full)) return [];
  return readdirSync(full)
    .sort()
    .flatMap((name) => {
      const rel = `${dir}/${name}`;
      return statSync(join(root, rel)).isDirectory() ? filesUnder(rel) : [rel];
    });
}

/** Names of the directories directly under `dir`. */
function dirsUnder(dir) {
  const full = join(root, dir);
  if (!existsSync(full)) return [];
  return readdirSync(full)
    .sort()
    .filter((name) => statSync(join(full, name)).isDirectory());
}

/** The table rows of KIRO_USAGE.md as { kind, paths }. */
function readRows() {
  const text = readFileSync(join(root, USAGE), "utf8");
  const rows = [];
  for (const line of text.split("\n")) {
    if (!line.startsWith("|")) continue;
    const cells = line.split("|").map((cell) => cell.trim());
    const kind = cells[1] ?? "";
    if (kind === "" || kind === "Kind" || /^-+$/.test(kind)) continue;
    const paths = (cells[3] ?? "")
      .split(",")
      .map((p) => p.trim().replace(/^`|`$/g, ""))
      .filter((p) => p !== "");
    rows.push({ kind, paths });
  }
  return rows;
}

/** Everything under .kiro that the table must name. Specs are named by directory. */
function expectedPaths() {
  const files = [
    ...filesUnder(".kiro/hooks"),
    ...filesUnder(".kiro/steering"),
    ...filesUnder(".kiro/agents"),
    ...filesUnder(".kiro/settings"),
    ...filesUnder(".kiro/skills").filter((p) => p.endsWith("/SKILL.md")),
  ];
  const powers = dirsUnder("powers")
    .filter((name) => existsSync(join(root, "powers", name, "plugin.json")))
    .map((name) => `powers/${name}/plugin.json`);
  const specs = dirsUnder(".kiro/specs").map((name) => `.kiro/specs/${name}`);
  return { files: [...files, ...powers], specs };
}

function countByKind(rows) {
  const counts = new Map();
  for (const { kind } of rows) counts.set(kind, (counts.get(kind) ?? 0) + 1);
  return [...counts].map(([kind, n]) => `${kind}: ${n}`).join(", ");
}

function findGaps(rows) {
  const named = new Set(rows.flatMap((row) => row.paths));
  const { files, specs } = expectedPaths();
  const gaps = [];
  for (const file of files) {
    if (!named.has(file)) gaps.push(`not in ${USAGE}: ${file}`);
  }
  for (const spec of specs) {
    const listed = [...named].some((p) => p === spec || p.startsWith(`${spec}/`));
    if (!listed) gaps.push(`not in ${USAGE}: ${spec}/ (spec directory)`);
  }
  for (const path of named) {
    if (!existsSync(join(root, path)))
      gaps.push(`${USAGE} names a path that does not exist: ${path}`);
  }
  return gaps;
}

if (!existsSync(join(root, USAGE))) {
  console.log(`missing: ${USAGE}`);
  process.exit(1);
}
const rows = readRows();
const gaps = findGaps(rows);
if (gaps.length > 0) {
  console.log(gaps.join("\n"));
  process.exit(1);
}
console.log(`${USAGE}: ${rows.length} rows. ${countByKind(rows)}`);
