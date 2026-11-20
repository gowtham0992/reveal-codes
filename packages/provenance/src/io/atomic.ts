import { ok } from "@reveal-codes/engine";
import type { Result } from "@reveal-codes/engine";
import type { Deps, FsError } from "./deps.js";

let counter = 0;

function dirOf(path: string): string {
  const cut = path.lastIndexOf("/");
  return cut <= 0 ? "/" : path.slice(0, cut);
}

/**
 * Writes `data` to a temporary file in the same directory and renames it over
 * `path`, so a reader sees the old file or the new one (Req 5.3). The parent
 * directory is created. When the rename fails the temporary file is removed
 * and the old file is untouched.
 */
export async function atomicWrite(
  deps: Pick<Deps, "fs" | "pid">,
  path: string,
  data: Uint8Array | string,
): Promise<Result<void, FsError>> {
  const made = await deps.fs.mkdirp(dirOf(path));
  if (!made.ok) return made;
  counter += 1;
  const temporary = `${path}.tmp-${String(deps.pid)}-${String(counter)}`;
  const written = await deps.fs.writeFile(temporary, data);
  if (!written.ok) {
    await deps.fs.unlink(temporary);
    return written;
  }
  const moved = await deps.fs.rename(temporary, path);
  if (!moved.ok) {
    await deps.fs.unlink(temporary);
    return moved;
  }
  return ok(undefined);
}
