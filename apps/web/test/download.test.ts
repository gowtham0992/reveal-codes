// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { DOCX_MIME, browserDownload } from "../src/client/download";

type UrlApi = { createObjectURL: unknown; revokeObjectURL: unknown };
const urlApi = URL as unknown as UrlApi;
const saved = { create: urlApi.createObjectURL, revoke: urlApi.revokeObjectURL };

afterEach(() => {
  urlApi.createObjectURL = saved.create;
  urlApi.revokeObjectURL = saved.revoke;
  vi.restoreAllMocks();
});

function install(): { blobs: Blob[]; revoked: string[] } {
  const blobs: Blob[] = [];
  const revoked: string[] = [];
  urlApi.createObjectURL = (b: Blob): string => {
    blobs.push(b);
    return "blob:test-1";
  };
  urlApi.revokeObjectURL = (u: string): void => {
    revoked.push(u);
  };
  return { blobs, revoked };
}

describe("browserDownload _Requirements: 7.2, 7.3_", () => {
  it("clicks an anchor named for the file, with a docx Blob of the same bytes, then revokes", async () => {
    const seen = install();
    const clicked: { download: string; href: string }[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      clicked.push({ download: this.download, href: this.href });
    });
    browserDownload(new Uint8Array([1, 2, 3]), "motion-2026-11-20.docx");
    expect(clicked).toEqual([{ download: "motion-2026-11-20.docx", href: "blob:test-1" }]);
    expect(seen.blobs).toHaveLength(1);
    expect(seen.blobs[0]?.type).toBe(DOCX_MIME);
    expect(Array.from(new Uint8Array(await (seen.blobs[0] ?? new Blob()).arrayBuffer()))).toEqual([
      1, 2, 3,
    ]);
    expect(seen.revoked).toEqual(["blob:test-1"]);
  });

  it("revokes the URL when the click throws, and rethrows", () => {
    const seen = install();
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(() => {
      browserDownload(new Uint8Array([9]), "a.docx");
    }).toThrow("blocked");
    expect(seen.revoked).toEqual(["blob:test-1"]);
  });
});
