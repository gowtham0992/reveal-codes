import { describe, expect, it } from "vitest";
import { htmlToText } from "../src/html";

describe("htmlToText", () => {
  it("removes tags and turns block tags into newlines", () => {
    expect(htmlToText("<p>one <em>two</em></p><div>three</div>a<br/>b")).toBe(
      "\none two\n\nthree\na\nb",
    );
  });

  it("drops script, style and star-pagination elements with their content", () => {
    const html =
      '<style>p{x:y}</style>less <span class="star-pagination" id="x">*665</span>stringent<script>var a = 1 < 2;</script> standards';
    expect(htmlToText(html)).toBe("less stringent standards");
  });

  it("decodes named and numeric entities in a single pass", () => {
    expect(htmlToText("a&amp;b &lt;i&gt; &ldquo;q&rdquo; &#8212; &#x2019; &sect;1 &amp;lt;")).toBe(
      "a&b <i> \u201cq\u201d \u2014 \u2019 \u00a71 &lt;",
    );
  });

  it("turns invalid code points into U+FFFD and leaves unknown names alone", () => {
    expect(htmlToText("&#0;&#xD800;&#1114112;&bogus;")).toBe("\ufffd\ufffd\ufffd&bogus;");
  });
});
