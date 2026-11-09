import { localDateTime } from "@reveal-codes/export";
import { table } from "./report-table.js";
import type { FileReport, Finding, SweepReport } from "./types.js";

const FIXTURES_NOTICE = "Citations outside the recorded set read as not found in fixtures mode.";

function sortFiles(files: readonly FileReport[]): readonly FileReport[] {
  return [...files].sort((a, b) => a.file.localeCompare(b.file, "en"));
}

function summary(files: readonly FileReport[], mode: string): string {
  const count = files.length === 1 ? "1 file" : `${String(files.length)} files`;
  const drifted = String(files.filter((f) => f.findings.length > 0).length);
  return [count, `${drifted} with findings`, `${mode} mode`].join(" · ");
}

function section(file: FileReport): string {
  const body = file.findings.length === 0 ? "No drift." : table(file.findings);
  return `## ${file.file}\n\n${body}`;
}

export function renderReport(report: SweepReport): string {
  const files = sortFiles(report.files);
  const blocks = [
    `# Sentinel sweep — ${localDateTime(report.sweptAt)}`,
    summary(files, report.mode),
    ...(report.mode === "fixtures" ? [FIXTURES_NOTICE] : []),
    ...files.map(section),
  ];
  return `${blocks.join("\n\n")}\n`;
}

/** Fixed property order: kind, file, line, before, after, then waitUntil. */
function findingJson(f: Finding): Record<string, unknown> {
  const base = { kind: f.kind, file: f.file, line: f.line, before: f.before, after: f.after };
  return f.kind === "recheck_unavailable" ? { ...base, waitUntil: f.waitUntil } : base;
}

export function renderJson(report: SweepReport): string {
  const files = sortFiles(report.files).map((f) => ({
    file: f.file,
    findings: f.findings.map(findingJson),
  }));
  const value = { sweptAt: report.sweptAt.toISOString(), mode: report.mode, files };
  return `${JSON.stringify(value, null, 2)}\n`;
}
