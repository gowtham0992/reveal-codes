import { APPENDIX_TITLE } from "@reveal-codes/export";
import { strToU8 } from "fflate";
import { describe, expect, it } from "vitest";
import { openFile } from "../src/client/open-file";
import type { OpenInput } from "../src/client/open-file";
import { severalFilesOutcome } from "../src/client/open-outcome";
import {
  declaringPartZip,
  documentXml,
  passwordStandIn,
  simpleDocx,
  truncated,
  withoutDocumentXml,
  zipOf,
} from "./support/word-fixtures";

function input(name: string, bytes: Uint8Array, size = bytes.length): OpenInput {
  const copy = bytes.slice().buffer;
  return { name, size, arrayBuffer: () => Promise.resolve(copy) };
}
const utf8 = (s: string): Uint8Array => new TextEncoder().encode(s);

async function refused(file: OpenInput): Promise<{ notice: string; note: string }> {
  const out = await openFile(file);
  if (out.kind !== "refused") throw new Error(`expected a refusal, got ${out.kind}`);
  return { notice: out.notice, note: out.note };
}

/** _Requirements: 14.1, 14.2, 14.3, 14.4, 14.5, 14.6, 14.7, 14.8, 14.9, 14.10, 14.11, 19.1_ */
describe("refusals: exact wording _Requirements: 14.1, 14.2, 14.3, 14.4, 14.5, 14.6, 14.7_", () => {
  const damagedNote =
    "x.docx is not a Word document, or it is damaged. Save it again as .docx from Word, or choose another file.";

  it("refuses a file that is not a Word document", async () => {
    expect(await refused(input("x.docx", utf8("plain text, not a zip")))).toEqual({
      notice: "Could not open x.docx.",
      note: damagedNote,
    });
  });

  it("refuses a truncated zip and a zip with no document part as damaged", async () => {
    const good = simpleDocx(["First paragraph.", "Second paragraph.", "Third paragraph."]);
    expect((await refused(input("x.docx", truncated(good)))).note).toBe(damagedNote);
    expect((await refused(input("x.docx", withoutDocumentXml()))).note).toBe(damagedNote);
  });

  it("refuses a password-protected file", async () => {
    expect(await refused(input("x.docx", passwordStandIn()))).toEqual({
      notice: "Could not open x.docx.",
      note: "x.docx is password-protected, so it cannot be read. Remove the password in Word, save a copy, and open the copy.",
    });
  });

  it("refuses a file over 5 MB from its size, without reading it", async () => {
    let reads = 0;
    const big: OpenInput = {
      name: "big.txt",
      size: 5_242_881,
      arrayBuffer: () => {
        reads += 1;
        return Promise.resolve(new ArrayBuffer(0));
      },
    };
    expect(await refused(big)).toEqual({
      notice: "Could not open big.txt.",
      note: "big.txt is larger than 5 MB. Open a smaller file, or paste the text into the page.",
    });
    expect(reads).toBe(0);
  });

  it("accepts exactly 5 MB by size", async () => {
    const out = await openFile(input("edge.txt", utf8("text"), 5_242_880));
    expect(out.kind).toBe("text");
  });

  it("refuses more than 200,000 characters and accepts exactly 200,000", async () => {
    expect(await refused(input("long.txt", utf8("a".repeat(200_001))))).toEqual({
      notice: "Could not open long.txt.",
      note: "long.txt holds more than 200,000 characters, which is more than this page can check. Split the filing and open one part.",
    });
    const edge = await openFile(input("edge.txt", utf8("a".repeat(200_000))));
    expect(edge.kind).toBe("text");
  });

  it("refuses empty and white-space-only files", async () => {
    const note = "e.md is empty. Choose a file that has text in it.";
    for (const text of ["", "   ", "\n\r\n\t ", "\uFEFF \n"]) {
      expect(await refused(input("e.md", utf8(text)))).toEqual({
        notice: "Could not open e.md.",
        note,
      });
    }
  });

  it("refuses a wrong kind of file", async () => {
    for (const name of ["a.pdf", "a.doc", "a.rtf", "a", "a.docx.bak"]) {
      expect(await refused(input(name, utf8("x")))).toEqual({
        notice: `Could not open ${name}.`,
        note: `${name} is not a .docx, .txt or .md file. Choose one of those.`,
      });
    }
  });

  it("opens the kinds case-insensitively", async () => {
    expect((await openFile(input("A.TXT", utf8("x")))).kind).toBe("text");
    expect((await openFile(input("A.Md", utf8("x")))).kind).toBe("text");
  });

  it("refuses text that is not UTF-8, including UTF-16 with and without a mark", async () => {
    const note = "u.txt is not UTF-8 text. Save it as UTF-8 and open it again.";
    const utf16le = new Uint8Array([0xff, 0xfe, 0x41, 0x00, 0x42, 0x00]);
    const utf16be = new Uint8Array([0xfe, 0xff, 0x00, 0x41, 0x00, 0x42]);
    const bare = new Uint8Array([0x41, 0xc3, 0x28]);
    for (const bytes of [utf16le, utf16be, bare]) {
      expect(await refused(input("u.txt", bytes))).toEqual({
        notice: "Could not open u.txt.",
        note,
      });
    }
  });

  it("refuses several files with its own message", () => {
    expect(severalFilesOutcome()).toEqual({
      kind: "refused",
      notice: "Open one file at a time.",
      note: "Open one file at a time. Drop a single file.",
    });
  });

  it("refuses an Appendix with no filing end", async () => {
    const bytes = zipOf({
      "word/document.xml": strToU8(documentXml(["Body.", APPENDIX_TITLE, "Line."])),
    });
    expect(await refused(input("x.docx", bytes))).toEqual({
      notice: "Could not open x.docx.",
      note: "x.docx has a Provenance Appendix but its filing could not be separated from it. Open the original export, or copy the filing into a new file.",
    });
  });

  it("refuses a part that declares more than 32 MiB, without unpacking it", async () => {
    const bytes = declaringPartZip(33_554_433);
    const out = await refused(input("x.docx", bytes));
    expect(out.notice).toBe("Could not open x.docx.");
    expect(out.note).toBe(damagedNote);
  });
});

describe("refusal order _Requirements: 14.12_", () => {
  it("checks the kind before the size", async () => {
    const out = await refused(input("a.pdf", utf8("x"), 6_000_000));
    expect(out.note).toContain("is not a .docx, .txt or .md file");
  });

  it("checks the size before the content", async () => {
    const out = await refused(input("a.txt", new Uint8Array([0xff, 0xfe]), 6_000_000));
    expect(out.note).toContain("is larger than 5 MB");
  });

  it("checks UTF-8 before the text limits", async () => {
    const bytes = new Uint8Array(200_005).fill(0x61);
    bytes[3] = 0xff;
    expect((await refused(input("a.txt", bytes))).note).toContain("is not UTF-8 text");
  });

  it("checks the Word reading before the text limits", async () => {
    const out = await refused(input("a.docx", utf8(" ".repeat(10))));
    expect(out.note).toContain("is not a Word document, or it is damaged");
  });

  it("checks too long before empty by testing length first", async () => {
    const out = await refused(input("a.txt", utf8(" ".repeat(200_001))));
    expect(out.note).toContain("holds more than 200,000 characters");
  });
});

describe("text files _Requirements: 19.1, 19.2_", () => {
  it("drops a byte-order mark and reads \\r\\n and lone \\r as \\n", async () => {
    const bytes = new Uint8Array([0xef, 0xbb, 0xbf, ...utf8("one\r\ntwo\rthree\n\r\nfour")]);
    const out = await openFile(input("w.txt", bytes));
    expect(out).toMatchObject({ kind: "text", text: "one\ntwo\nthree\n\nfour", removed: 0 });
    if (out.kind === "text") expect(out.text).not.toContain("\uFEFF");
  });

  it("keeps Markdown as it is", async () => {
    const md = "# Title\n\n* item\n\n> quote _em_ `code`\n";
    const out = await openFile(input("n.md", utf8(md)));
    expect(out).toMatchObject({ kind: "text", text: md, note: null });
  });

  it("states the character count and that the text is marked as pasted", async () => {
    const out = await openFile(input("n.txt", utf8("abc")));
    expect(out.notice).toBe("Opened n.txt: 3 characters, marked as pasted.");
  });
});
