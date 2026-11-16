import { describe, expect, it } from "vitest";
import { decodeEntities, paragraphsOf } from "@reveal-codes/export";

const p = (inner: string): string => `<w:p>${inner}</w:p>`;
const t = (text: string): string => `<w:r><w:t>${text}</w:t></w:r>`;

describe("paragraphsOf", () => {
  it("does not treat <w:pPr> as w:p", () => {
    expect(paragraphsOf(p(`<w:pPr><w:jc w:val="left"/></w:pPr>${t("a")}`))).toEqual(["a"]);
  });

  it("does not treat tab, table and cell tags as w:t", () => {
    const xml = `<w:tbl><w:tr><w:tc><w:tcPr/>${p(`<w:tab/>${t("x")}`)}</w:tc></w:tr></w:tbl>`;
    expect(paragraphsOf(xml)).toEqual(["\tx"]);
  });

  it("reads <w:p/> as an empty paragraph", () => {
    expect(paragraphsOf(`${p(t("a"))}<w:p/>${p(t("b"))}`)).toEqual(["a", "", "b"]);
  });

  it("lists a table-cell paragraph in order", () => {
    const xml = `${p(t("before"))}<w:tbl><w:tr><w:tc>${p(t("cell"))}</w:tc></w:tr></w:tbl>${p(t("after"))}`;
    expect(paragraphsOf(xml)).toEqual(["before", "cell", "after"]);
  });

  it("adds a line feed for plain and textWrapping breaks only", () => {
    const br = (attrs: string): string => p(`${t("a")}<w:r><w:br${attrs}/></w:r>${t("b")}`);
    expect(paragraphsOf(br(""))).toEqual(["a\nb"]);
    expect(paragraphsOf(br(' w:type="textWrapping"'))).toEqual(["a\nb"]);
    expect(paragraphsOf(br(' w:type="page"'))).toEqual(["ab"]);
    expect(paragraphsOf(br(' w:type="column"'))).toEqual(["ab"]);
  });

  it("ignores a self-closing <w:t/>", () => {
    expect(paragraphsOf(p(`<w:r><w:t/></w:r>${t("a")}`))).toEqual(["a"]);
  });

  it("opens a new entry for a nested w:p and drops text after the inner close", () => {
    const xml = `<w:p>${t("outer")}<w:p>${t("inner")}</w:p>${t("lost")}</w:p>`;
    expect(paragraphsOf(xml)).toEqual(["outer", "inner"]);
  });
});

describe("decodeEntities", () => {
  it("decodes &amp;lt; to &lt; and not to <", () => {
    expect(decodeEntities("&amp;lt;")).toBe("&lt;");
  });

  it("decodes the five named entities", () => {
    expect(decodeEntities("&amp;&lt;&gt;&quot;&apos;")).toBe(`&<>"'`);
  });

  it("decodes decimal and hexadecimal references", () => {
    expect(decodeEntities("&#65;&#x42;&#X43;&#x1F600;")).toBe("ABC\u{1F600}");
  });

  it.each([
    ["&#0;"],
    ["&#x0;"],
    ["&#xD800;"],
    ["&#xDFFF;"],
    ["&#x110000;"],
    [`&#${"9".repeat(400)};`],
  ])("leaves %s as written", (ref) => {
    expect(decodeEntities(ref)).toBe(ref);
  });
});
