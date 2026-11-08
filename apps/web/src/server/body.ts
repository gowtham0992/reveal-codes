export type BodyResult = Readonly<{ ok: true; text: string }> | Readonly<{ ok: false }>;

const TOO_LARGE: BodyResult = { ok: false };

/**
 * Reads the request body as UTF-8 text, stopping as soon as more than
 * `maxBytes` have arrived. An oversize body is `{ ok: false }`; the stream is cancelled.
 */
export async function readBodyCapped(request: Request, maxBytes: number): Promise<BodyResult> {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) return TOO_LARGE;
  if (request.body === null) return { ok: true, text: "" };
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      return TOO_LARGE;
    }
    chunks.push(value);
  }
  return { ok: true, text: new TextDecoder().decode(concat(chunks, total)) };
}

function concat(chunks: readonly Uint8Array[], total: number): Uint8Array {
  const out = new Uint8Array(total);
  let at = 0;
  for (const chunk of chunks) {
    out.set(chunk, at);
    at += chunk.byteLength;
  }
  return out;
}
