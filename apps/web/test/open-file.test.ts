import { describe, expect, it } from "vitest";
import { openFile } from "../src/client/open-file";
import type { OpenInput } from "../src/client/open-file";

function input(name: string, bytes: Uint8Array, size = bytes.length): OpenInput {
  const copy = bytes.slice().buffer;
  return { name, size, arrayBuffer: () => Promise.resolve(copy) };
}
const utf8 = (s: string): Uint8Array => new TextEncoder().encode(s);

describe("openFile", () => {
  it("refuses the kind before the size, and the size without reading", async () => {
    let reads = 0;
    const big: OpenInput = {
      name: "a.txt",
      size: 5_242_881,
      arrayBuffer: () => {
        reads += 1;
        return Promise.resolve(new ArrayBuffer(0));
      },
    };
    const size = await openFile(big);
    expect(size.kind).toBe("refused");
    expect(reads).toBe(0);
    const kind = await openFile({ ...big, name: "a.pdf" });
    expect(kind.kind === "refused" && kind.note).toContain("is not a .docx, .txt or .md file");
  });

  it("opens text with docxSafe and the removed-character sentence", async () => {
    const out = await openFile(input("a.md", utf8("one\u0001two\r\nthree")));
    expect(out).toMatchObject({ kind: "text", text: "onetwo\nthree", removed: 1, note: null });
    expect(out.notice).toBe(
      "Opened a.md: 12 characters, marked as pasted. 1 character that Word files cannot store was removed.",
    );
  });

  it("refuses white space only, invalid UTF-8 and a non-zip .docx", async () => {
    const empty = await openFile(input("a.txt", utf8(" \n\u0001")));
    expect(empty.kind === "refused" && empty.note).toBe(
      "a.txt is empty. Choose a file that has text in it.",
    );
    const bad = await openFile(input("a.txt", new Uint8Array([0xff, 0xfe, 0x41])));
    expect(bad.kind === "refused" && bad.note).toContain("is not UTF-8 text");
    const word = await openFile(input("a.docx", utf8("nope")));
    expect(word).toMatchObject({ kind: "refused", notice: "Could not open a.docx." });
  });

  it("turns a failed read into a refusal that keeps the cause", async () => {
    const cause = new Error("boom");
    const out = await openFile({
      name: "a.docx",
      size: 1,
      arrayBuffer: () => Promise.reject(cause),
    });
    expect(out).toMatchObject({ kind: "refused", cause });
  });
});
