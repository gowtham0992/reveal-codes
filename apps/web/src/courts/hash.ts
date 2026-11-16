/** The text after "#", percent-decoded. Text that is not valid percent-encoding is returned as it is. */
export function decodeHash(hash: string): string {
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  try {
    return decodeURIComponent(raw);
  } catch (error) {
    if (error instanceof URIError) return raw;
    throw error;
  }
}

/** True when the hash names an instrument that is not in force, so the checkbox starts ticked. */
export function showInactiveForHash(hash: string, inactiveIds: readonly string[]): boolean {
  const id = decodeHash(hash);
  return id !== "" && inactiveIds.includes(id);
}
