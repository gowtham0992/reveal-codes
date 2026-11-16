const COMPOUND = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1] as const;

const ENCRYPTED_PACKAGE: readonly number[] = Array.from(
  { length: "EncryptedPackage".length },
  (_, i) => ["EncryptedPackage".charCodeAt(i), 0],
).flat();

function matchesAt(bytes: Uint8Array, needle: readonly number[], at: number): boolean {
  for (let j = 0; j < needle.length; j++) {
    if (bytes[at + j] !== needle[j]) return false;
  }
  return true;
}

/** True when the bytes start with the compound file (OLE2) signature. */
export function isCompoundFile(bytes: Uint8Array): boolean {
  return bytes.length >= COMPOUND.length && matchesAt(bytes, COMPOUND, 0);
}

/** True for a compound file that also holds the UTF-16LE name "EncryptedPackage". */
export function holdsEncryptedPackage(bytes: Uint8Array): boolean {
  if (!isCompoundFile(bytes)) return false;
  const last = bytes.length - ENCRYPTED_PACKAGE.length;
  for (let i = COMPOUND.length; i <= last; i++) {
    if (matchesAt(bytes, ENCRYPTED_PACKAGE, i)) return true;
  }
  return false;
}
