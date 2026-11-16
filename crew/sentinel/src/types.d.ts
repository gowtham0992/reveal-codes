export type Mode = "fixtures" | "live";
export type Clock = () => Date;
export type { DocxText, ExportParts } from "@reveal-codes/export";
export type SentinelError = Readonly<{
    kind: "not_docx";
}> | Readonly<{
    kind: "not_reveal_codes_export";
}> | Readonly<{
    kind: "appendix_unparseable";
    detail: string;
}> | Readonly<{
    kind: "read_failed";
    detail: string;
}>;
type FindingBase = Readonly<{
    file: string;
    /** Integer of at least 1, or null. */
    line: number | null;
    before: string;
    after: string;
}>;
export type Finding = (FindingBase & Readonly<{
    kind: "body_edited";
}>) | (FindingBase & Readonly<{
    kind: "citation_changed";
}>) | (FindingBase & Readonly<{
    kind: "quote_changed";
}>) | (FindingBase & Readonly<{
    kind: "override_stale";
}>) | (FindingBase & Readonly<{
    kind: "recheck_unavailable";
    waitUntil: string | null;
}>) | (FindingBase & Readonly<{
    kind: "unreadable";
}>);
export type FileReport = Readonly<{
    file: string;
    findings: readonly Finding[];
}>;
export type SweepReport = Readonly<{
    sweptAt: Date;
    mode: Mode;
    files: readonly FileReport[];
}>;
