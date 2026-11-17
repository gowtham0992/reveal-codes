import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ORDERS } from "@reveal-codes/export";
import type { OrderEntry, OrderRole } from "@reveal-codes/export";
import Page from "../app/courts/page";
import { InstrumentView } from "../src/courts/instrument-view";
import { buildCourtsModel } from "../src/courts/view-model";
import { judgeLine, placementWords } from "../src/order-copy";

const model = buildCourtsModel(ORDERS, null);

function entryWithRole(role: OrderRole, trade = false): OrderEntry {
  const found = ORDERS.entries.find(
    (e) => e.judge?.role === role && (e.court.level === "trade") === trade,
  );
  if (found === undefined) throw new Error(`no shipped entry with role ${role}`);
  return found;
}

function articleHtml(entry: OrderEntry): string {
  return renderToString(<InstrumentView entry={entry} words={model.words} titles={model.titles} />);
}

function decode(text: string): string {
  return text
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function shownText(html: string): string {
  const broken = html.replace(/<\/(p|li|h[1-6]|blockquote)>|<br\s*\/?>/g, "\n");
  return decode(broken.replace(/<[^>]*>/g, ""));
}

/** Every string the dataset supplies as entry content: shown as data, not as the page's words. */
function entryStrings(): string[] {
  const out: string[] = [];
  const walk = (value: unknown): void => {
    if (typeof value === "string") out.push(value);
    else if (Array.isArray(value)) value.forEach(walk);
    else if (typeof value === "object" && value !== null) Object.values(value).forEach(walk);
  };
  for (const entry of ORDERS.entries) walk(entry);
  return out.filter((v) => v.length > 3).sort((a, b) => b.length - a.length);
}

function collectKeys(value: unknown, into: Set<string>): void {
  if (Array.isArray(value)) {
    for (const item of value) collectKeys(item, into);
  } else if (typeof value === "object" && value !== null) {
    for (const [key, child] of Object.entries(value)) {
      into.add(key);
      collectKeys(child, into);
    }
  }
}

function blockTexts(html: string): string[] {
  const out: string[] = [];
  for (const m of html.matchAll(/<(p|h[1-6])\b[^>]*>(.*?)<\/\1>/gs)) {
    out.push(
      shownText(m[2] ?? "")
        .replace(/\s+/g, " ")
        .trim(),
    );
  }
  return out;
}

describe("judge line _Requirements: 19.1, 19.4_", () => {
  const cases: ReadonlyArray<readonly [OrderRole, string]> = [
    ["magistrate", "Magistrate Judge"],
    ["senior", "Senior Judge"],
    ["chief", "Chief Judge"],
    ["district", "Judge"],
  ];
  it.each(cases)("prints the %s role as its title, then the name", (role, title) => {
    const entry = entryWithRole(role);
    const name = entry.judge?.name ?? "";
    expect(judgeLine({ name, role })).toBe(`${title} ${name}`);
    expect(blockTexts(articleHtml(entry))).toContain(`${title} ${name}`);
  });

  it("reads Judge <name> for a Court of International Trade district judge", () => {
    const entry = entryWithRole("district", true);
    const name = entry.judge?.name ?? "";
    const texts = blockTexts(articleHtml(entry));
    expect(texts).toContain(`Judge ${name}`);
    expect(texts.join("\n")).not.toContain("District Judge");
  });
});

describe("no repeated line _Requirements: 20.1, 20.2_", () => {
  it("never repeats a paragraph or heading inside one article", () => {
    for (const entry of ORDERS.entries) {
      const texts = blockTexts(articleHtml(entry));
      expect(new Set(texts).size, entry.id).toBe(texts.length);
    }
  });
});

describe("look of the page _Requirements: 21.2, 21.3, 21.4, 21.5, 21.6_", () => {
  it("has one header link to / holding the aria-hidden Mark and the wordmark, and one h1", () => {
    const html = renderToString(<Page />);
    const header = /<header[^>]*>(.*?)<\/header>/s.exec(html)?.[1] ?? "";
    expect(header).toMatch(/^<a href="\/"[^>]*>/);
    expect(header).not.toContain("target=");
    expect(header).toContain('<img src="/icon.svg" alt="" aria-hidden="true"');
    expect(header).toContain("Reveal Codes</span>");
    expect(html.match(/<h1\b/g)).toHaveLength(1);
  });

  it("shows the Requires label only for entries with elements", () => {
    for (const entry of ORDERS.entries) {
      const html = articleHtml(entry);
      expect(html.includes(">Requires</p>"), entry.id).toBe(entry.elements.length > 0);
    }
    expect(ORDERS.entries.some((e) => e.elements.length === 0)).toBe(true);
  });

  it("prints the required heading with curly quotes and a lower-case placement", () => {
    const withCaption = ORDERS.entries.filter((e) => e.caption !== null);
    expect(withCaption.length).toBeGreaterThan(0);
    for (const entry of withCaption) {
      const text = blockTexts(articleHtml(entry));
      const caption = entry.caption as NonNullable<OrderEntry["caption"]>;
      const placement = placementWords[caption.placement].toLowerCase();
      expect(text, entry.id).toContain(
        `Required heading: \u201C${caption.text}\u201D (${placement})`,
      );
      expect(text.join("\n")).not.toContain("Caption:");
    }
  });

  it("puts Not in force. first after the title for every entry that is not in force", () => {
    const replaced = ORDERS.entries.filter((e) => e.status !== "current");
    expect(replaced.length).toBeGreaterThan(0);
    for (const entry of replaced) {
      const html = articleHtml(entry);
      expect(html, entry.id).toMatch(/<\/h3><p class="[^"]*">Not in force\./);
    }
  });
});

describe("not-in-force wording _Requirements: 18.1_", () => {
  it("prints Not in force. and a Replaced by link to the replacing title", () => {
    const entry = ORDERS.entries.find(
      (e) => e.superseded_by !== undefined && model.titles[e.superseded_by] !== undefined,
    );
    const target = entry?.superseded_by ?? "";
    const html = articleHtml(entry as OrderEntry);
    expect(shownText(html).replace(/\s+/g, " ")).toContain(
      `Not in force. Replaced by ${model.titles[target] ?? ""}.`,
    );
    expect(html).toContain(`href="#${target}"`);
  });
});

describe("page words _Requirements: 18.3_", () => {
  it("shows no schema-shaped dataset field name and no word with an underscore", () => {
    const keys = new Set<string>();
    collectKeys(ORDERS, keys);
    let text = shownText(renderToString(<Page />));
    for (const value of entryStrings()) text = text.split(value).join("\n");
    expect(text).not.toMatch(/\w_\w|_\w|\w_/);
    // Ordinary English keys (court, text) are page words too; check names shaped like a schema.
    const schemaShaped = [...keys].filter((key) => key.includes("_") || /[a-z][A-Z]/.test(key));
    expect(schemaShaped.length).toBeGreaterThan(0);
    const found = schemaShaped.filter((key) => {
      const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      return new RegExp(`(?<![\\w])${escaped}(?![\\w])`).test(text);
    });
    expect(found).toEqual([]);
  });
});
