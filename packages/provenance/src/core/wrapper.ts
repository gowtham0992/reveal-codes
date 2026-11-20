/**
 * The shell wrapper `.kiro/provenance/reveal` (Decision 3): POSIX `sh`, runs the Bundle that sits
 * beside it. Windows is not supported. Pure; no `node:`.
 */
/** The file content of the wrapper. */
export function wrapperText(): string {
  return '#!/bin/sh\nexec node "$(dirname "$0")/provenance.mjs" reveal "$@"\n';
}
