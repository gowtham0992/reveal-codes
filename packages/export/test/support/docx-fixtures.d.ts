export declare const FIXED_ISO = "2024-01-02T03:04:05.000Z";
export declare const FIXTURE_TEXT: {
    readonly paragraphs: readonly ["First paragraph.", "Second paragraph with a footnote."];
    readonly table: readonly [readonly ["Cell A1", "Cell B1"], readonly ["Cell A2", "Cell B2"]];
    readonly kept: "Kept ";
    readonly inserted: "inserted text";
    readonly deleted: "deleted text";
    readonly footnotes: readonly ["First footnote.", "Second footnote."];
};
/** Rewrites a part map as a zip with sorted entry order and one fixed timestamp. */
export declare function zipFixed(parts: Readonly<Record<string, Uint8Array>>, level?: 0 | 6): Uint8Array;
export declare function partsOf(bytes: Uint8Array): Record<string, Uint8Array>;
export declare function partText(bytes: Uint8Array, name: string): string;
/** Paragraphs, a table, a tracked insertion and deletion, and two footnotes. The docx library writes empty endnotes. */
export declare function buildFixtureDocx(): Promise<Uint8Array>;
/** A compound-file header (as Word writes for a password-protected file) with the EncryptedPackage stream name. */
export declare function passwordProtectedStandIn(): Uint8Array;
/** The zip with its tail (and so its central directory) cut off. */
export declare function truncatedZip(bytes: Uint8Array): Uint8Array;
/** A valid zip with no word/document.xml. */
export declare function zipWithoutDocumentXml(bytes: Uint8Array): Uint8Array;
/**
 * A zip whose central directory declares `declared` bytes for word/document.xml while the stream inflates to
 * `actual` bytes. The local header and the compressed size are left as they are.
 */
export declare function oversizePartZip(declared?: number, actual?: number): Uint8Array;
/** `bytes` with one character of the first body text run changed (a letter becomes the next letter). */
export declare function editOneCharacter(bytes: Uint8Array): Uint8Array;
/** An export built by the package's own buildDocx from the demo filing, and the same bytes edited by one character. */
export declare function exportAndEditedExport(): Promise<{
    original: Uint8Array;
    edited: Uint8Array;
}>;
