// Minimal .docx byte builders for the Open flow tests. Copied in small form from
// packages/export/test/support/docx-fixtures.ts, which the web TypeScript project cannot import
// (its rootDir stops at apps/web).
import { strToU8, zipSync } from "fflate";

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
const MTIME = new Date(2024, 0, 2, 4, 6, 8);
const CENTRAL_SIGNATURE = 0x02014b50;

export function zipOf(parts: Readonly<Record<string, Uint8Array>>): Uint8Array {
  const out: Record<string, [Uint8Array, { level: 6; mtime: Date }]> = {};
  for (const name of Object.keys(parts).sort()) {
    out[name] = [parts[name] as Uint8Array, { level: 6, mtime: MTIME }];
  }
  return zipSync(out);
}

export function documentXml(lines: readonly string[]): string {
  const ps = lines.map((l) => `<w:p><w:r><w:t>${l}</w:t></w:r></w:p>`).join("");
  return `<w:document ${W}><w:body>${ps}</w:body></w:document>`;
}

/** A readable one-part Word file holding `lines` as paragraphs. */
export function simpleDocx(lines: readonly string[]): Uint8Array {
  return zipOf({ "word/document.xml": strToU8(documentXml(lines)) });
}

/** The zip with its tail, and so its central directory, cut off. */
export function truncated(bytes: Uint8Array): Uint8Array {
  return bytes.slice(0, Math.floor(bytes.length / 2));
}

/** A valid zip that has no word/document.xml. */
export function withoutDocumentXml(): Uint8Array {
  return zipOf({ "word/other.xml": strToU8("<x/>") });
}

/** A compound-file header with the EncryptedPackage stream name, as Word writes for a password. */
export function passwordStandIn(): Uint8Array {
  const out = new Uint8Array(1536);
  out.set([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1], 0);
  const name = "EncryptedPackage";
  for (let i = 0; i < name.length; i++) out[1024 + i * 2] = name.charCodeAt(i);
  return out;
}

/** A zip whose central directory declares `declared` bytes for word/document.xml. */
export function declaringPartZip(declared: number): Uint8Array {
  const zip = simpleDocx(["a".repeat(2000)]);
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  for (let i = 0; i + 46 <= zip.length; i++) {
    if (view.getUint32(i, true) === CENTRAL_SIGNATURE) view.setUint32(i + 24, declared, true);
  }
  return zip;
}
