import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { WEB_ROOT } from "./support/scan";
describe("route maxDuration", () => {
  it.each(["app/api/verify/route.ts", "app/api/opinion/[clusterId]/route.ts"])(
    "%s lets the host run for 60 seconds",
    (file) => {
      const source = readFileSync(join(WEB_ROOT, file), "utf8");
      expect(source).toMatch(/^export const maxDuration = 60;$/m);
    },
  );
});
