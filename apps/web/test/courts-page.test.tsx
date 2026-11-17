import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ORDERS, orderStats } from "@reveal-codes/export";
import type { OrderEntry } from "@reveal-codes/export";
import Page, { metadata } from "../app/courts/page";

/** Escapes text the way React does when it writes text and attribute values. */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

function countOf(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

function renderPage(repoUrl: string): string {
  vi.stubEnv("NEXT_PUBLIC_REPO_URL", repoUrl);
  return renderToString(<Page />);
}

const IN_FORCE: readonly OrderEntry[] = ORDERS.entries.filter((e) => e.status === "current");
const NOT_IN_FORCE: readonly OrderEntry[] = ORDERS.entries.filter((e) => e.status !== "current");

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("/courts page content _Requirements: 1.3, 2.2, 4.10, 4.11, 5.1, 5.2, 7.1, 7.2, 16.1_", () => {
  it("has the shipped dataset's in-force and not-in-force instruments to test against", () => {
    expect(IN_FORCE.length).toBeGreaterThan(0);
    expect(NOT_IN_FORCE.length).toBeGreaterThan(0);
  });

  it("renders every dataset id exactly once as an id attribute", () => {
    const html = renderPage("");
    for (const entry of ORDERS.entries) {
      expect(countOf(html, ` id="${escapeHtml(entry.id)}"`), entry.id).toBe(1);
    }
  });

  it("states the figures that orderStats returns", () => {
    const html = renderPage("");
    const stats = orderStats(ORDERS);
    expect(html).toContain(
      `This page lists ${String(stats.total)} court rules and orders on generative AI in filings, ` +
        `from ${String(stats.courts)} courts. ${String(stats.inForce)} are in force. ` +
        `The list was compiled on ${stats.compiled}.`,
    );
  });

  it("links each superseded instrument to a target that exists on the page", () => {
    const html = renderPage("");
    const superseded = ORDERS.entries.filter((e) => e.superseded_by !== undefined);
    expect(superseded.length).toBeGreaterThan(0);
    for (const entry of superseded) {
      const target = escapeHtml(entry.superseded_by ?? "");
      expect(html, entry.id).toContain(`href="#${target}"`);
      expect(countOf(html, ` id="${target}"`), entry.id).toBe(1);
    }
  });

  it("says Not in force. and no vocabulary status sentence _Requirements: 18.1, 18.2_", () => {
    const html = renderPage("");
    for (const entry of ORDERS.entries.filter((e) => e.superseded_by !== undefined)) {
      const target = escapeHtml(entry.superseded_by ?? "");
      expect(html, entry.id).toContain(`Not in force.<!-- --> Replaced by <a href="#${target}">`);
    }
    for (const sentence of Object.values(ORDERS.vocabulary.status)) {
      expect(html).not.toContain(escapeHtml(sentence));
    }
  });

  it("gives each in-force instrument its percent-encoded Order_Link and no other instrument one", () => {
    const html = renderPage("");
    for (const entry of IN_FORCE) {
      const href = `href="${escapeHtml(`/?order=${encodeURIComponent(entry.id)}`)}"`;
      expect(countOf(html, href), entry.id).toBe(1);
    }
    for (const entry of NOT_IN_FORCE) {
      expect(html, entry.id).not.toContain(`/?order=${encodeURIComponent(entry.id)}`);
    }
    expect(countOf(html, "/?order=")).toBe(IN_FORCE.length);
  });

  it("does not leak retrieved, source_kind or notes", () => {
    const html = renderPage("");
    const shown = [
      ORDERS.compiled,
      ...ORDERS.entries.flatMap((e) => [e.date, e.date_note ?? "", e.key_language, e.title]),
    ].join("\n");
    const noted = ORDERS.entries.filter((e) => e.notes !== undefined && e.notes !== "");
    expect(noted.length).toBeGreaterThan(0);
    for (const entry of noted) {
      expect(html, entry.id).not.toContain(escapeHtml(entry.notes ?? ""));
    }
    for (const retrieved of new Set(ORDERS.entries.map((e) => e.retrieved))) {
      if (!shown.includes(retrieved)) expect(html).not.toContain(retrieved);
    }
    for (const kind of new Set(ORDERS.entries.map((e) => e.source_kind))) {
      expect(html).not.toContain(`>${kind}<`);
    }
    expect(html).not.toMatch(/retrieved|source_kind/i);
  });
});

describe("/courts page Repo_Base _Requirements: 2.5, 2.6, 16.9_", () => {
  const dataset = "https://example.org/repo/blob/main/data/standing-orders.json";
  const readme = "https://example.org/repo/blob/main/data/README.md";

  it("has no repository link when the address is unset", () => {
    const html = renderPage("");
    expect(html).not.toContain("/blob/main/");
    expect(html).not.toContain("data file");
  });

  it("builds both links from an address with a trailing slash", () => {
    const html = renderPage("https://example.org/repo/");
    expect(html).toContain(`href="${dataset}"`);
    expect(html).toContain(`href="${readme}"`);
    expect(html).not.toContain("repo//blob");
  });

  it("builds the same links from an address without one", () => {
    const html = renderPage("https://example.org/repo");
    expect(html).toContain(`href="${dataset}"`);
    expect(html).toContain(`href="${readme}"`);
  });
});

describe("/courts metadata _Requirements: 11.2_", () => {
  it("has exactly title and description", () => {
    expect(Object.keys(metadata).sort()).toEqual(["description", "title"]);
    expect(typeof metadata.title).toBe("string");
    expect(typeof metadata.description).toBe("string");
  });
});
