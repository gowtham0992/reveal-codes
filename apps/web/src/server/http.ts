export const NO_STORE: Readonly<Record<string, string>> = { "Cache-Control": "no-store" };

export function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...NO_STORE, "Content-Type": "application/json" },
  });
}

/** A 405 handler carrying `Allow` and `Cache-Control: no-store`. */
export function notAllowed(allow: string): () => Response {
  return () =>
    new Response(JSON.stringify({ error: "Method not allowed." }), {
      status: 405,
      headers: { ...NO_STORE, Allow: allow, "Content-Type": "application/json" },
    });
}

/** A 429 carrying `Retry-After` (seconds), `Cache-Control: no-store` and a fixed `{ error }` body. */
export function tooManyRequests(message: string, retryAfterSeconds: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status: 429,
    headers: {
      ...NO_STORE,
      "Retry-After": String(retryAfterSeconds),
      "Content-Type": "application/json",
    },
  });
}
