import { describe, expect, it } from "vitest";
import { renderJson, renderReport } from "../src/report.js";
import type { Finding, Mode, SweepReport } from "../src/types.js";

const SWEPT_AT = new Date(2026, 10, 20, 10, 30);
const NOTICE = "Citations outside the recorded set read as not found in fixtures mode.";

function finding(
  kind: Exclude<Finding["kind"], "recheck_unavailable">,
  over: Partial<Finding> = {},
): Finding {
  return { kind, file: "b.docx", line: 1, before: "x", after: "y", ...over } as Finding;
}

function report(mode: Mode, files: SweepReport["files"]): SweepReport {
  return { sweptAt: SWEPT_AT, mode, files };
}

describe("renderReport", () => {
  it("renders the worked example exactly", () => {
    const text = renderReport(
      report("fixtures", [
        {
          file: "b.docx",
          findings: [
            finding("citation_changed", {
              line: 12,
              before: "not_found",
              after: "verified 145875",
            }),
            {
              kind: "recheck_unavailable",
              file: "b.docx",
              line: null,
              before: "",
              after: "retry after 2026-11-02 04:00",
              waitUntil: "2026-11-02T12:00:30.000Z",
            },
          ],
        },
        { file: "a.docx", findings: [] },
      ]),
    );
    expect(text).toBe(
      [
        "# Sentinel sweep — 2026-11-20 10:30",
        "",
        "2 files · 1 with findings · fixtures mode",
        "",
        NOTICE,
        "",
        "## a.docx",
        "",
        "No drift.",
        "",
        "## b.docx",
        "",
        "| Finding | Line | Before | After |",
        "| --- | --- | --- | --- |",
        "| Citation changed | 12 | not_found | verified 145875 |",
        "| Recheck unavailable | - |  | retry after 2026-11-02 04:00 |",
        "",
      ].join("\n"),
    );
  });

  it("writes the summary for 0, 1 and 2 files", () => {
    expect(renderReport(report("live", []))).toContain(
      "\n\n0 files · 0 with findings · live mode\n",
    );
    const one = renderReport(report("live", [{ file: "a.docx", findings: [] }]));
    expect(one).toContain("1 file · 0 with findings · live mode");
  });

  it("prints the notice in fixtures mode only, and ends with one line feed", () => {
    const fixtures = renderReport(report("fixtures", []));
    expect(fixtures).toBe(
      "# Sentinel sweep — 2026-11-20 10:30\n\n0 files · 0 with findings · fixtures mode\n\n" +
        NOTICE +
        "\n",
    );
    const live = renderReport(report("live", []));
    expect(live).not.toContain(NOTICE);
    expect(live.endsWith("mode\n")).toBe(true);
    expect(live.endsWith("\n\n")).toBe(false);
  });

  it("uses all six labels, escapes pipes and flattens line feeds", () => {
    const kinds = [
      "body_edited",
      "citation_changed",
      "quote_changed",
      "override_stale",
      "unreadable",
    ] as const;
    const findings: Finding[] = [
      ...kinds.map((k) => finding(k)),
      {
        kind: "recheck_unavailable",
        file: "b.docx",
        line: null,
        before: "",
        after: "unavailable",
        waitUntil: null,
      },
    ];
    findings[0] = finding("body_edited", { before: "a|b", after: "c\nd" });
    const text = renderReport(report("live", [{ file: "b.docx", findings }]));
    for (const label of [
      "Body edited",
      "Citation changed",
      "Quote changed",
      "Override no longer needed",
      "Recheck unavailable",
      "Unreadable",
    ]) {
      expect(text).toContain(`| ${label} |`);
    }
    expect(text).toContain("| Body edited | 1 | a\\|b | c d |");
    expect(text).toContain("| Recheck unavailable | - |  | unavailable |");
    expect(text).not.toContain("!");
  });
});

describe("renderJson", () => {
  it("indents by two spaces, uses an ISO instant and ends in one line feed", () => {
    const text = renderJson(report("live", []));
    expect(text).toBe(
      `{\n  "sweptAt": "${SWEPT_AT.toISOString()}",\n  "mode": "live",\n  "files": []\n}\n`,
    );
  });

  it("sorts files and keeps waitUntil last", () => {
    const parsed = JSON.parse(
      renderJson(
        report("fixtures", [
          {
            file: "b.docx",
            findings: [
              {
                kind: "recheck_unavailable",
                file: "b.docx",
                line: null,
                before: "",
                after: "unavailable",
                waitUntil: null,
              },
            ],
          },
          { file: "a.docx", findings: [] },
        ]),
      ),
    ) as { files: { file: string; findings: object[] }[] };
    expect(parsed.files.map((f) => f.file)).toEqual(["a.docx", "b.docx"]);
    expect(Object.keys(parsed.files[1]?.findings[0] ?? {})).toEqual([
      "kind",
      "file",
      "line",
      "before",
      "after",
      "waitUntil",
    ]);
  });
});
