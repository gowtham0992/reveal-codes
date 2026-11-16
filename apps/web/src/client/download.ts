export const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/**
 * Hands `bytes` to the browser as a file download. The object URL is always
 * revoked, including when the anchor click throws. The only file that may call
 * `createObjectURL`.
 */
export function browserDownload(
  bytes: Uint8Array,
  fileName: string,
  mime: string = DOCX_MIME,
): void {
  const blob = new Blob([new Uint8Array(bytes)], { type: mime });
  const url = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
  } finally {
    URL.revokeObjectURL(url);
  }
}
