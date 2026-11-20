import { apply, createDocument } from "@reveal-codes/engine";
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, it } from "vitest";

/**
 * Task 6.4. Measures the built Bundle and prints median and maximum wall time. It asserts no number:
 * a shared runner is slower than the machine the limits were set on. Everything runs in a disposable
 * copy of this repository's tracked files; `record` never runs against the live `.kiro/provenance/`.
 */
const ENABLED = process.env["PROVENANCE_TIMING"] === "1";
const RUNS = 25;
const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const PAYLOAD = JSON.stringify({ session_id: "timing-session-0000", hook_event_name: "timing" });
const PROV = ".kiro/provenance";

let home = "";
let copy = "";

function env(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    HOME: home,
    XDG_CONFIG_HOME: join(home, "xdg"),
    GIT_CONFIG_GLOBAL: "/dev/null",
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_TERMINAL_PROMPT: "0",
  };
}

function run(cmd: string, args: string[], input?: string): void {
  const r = spawnSync(cmd, args, { cwd: copy, env: env(), input, encoding: "utf8" });
  if (r.error !== undefined) throw r.error;
  if (cmd === "git" && r.status !== 0) throw new Error(`git ${args.join(" ")}: ${r.stderr}`);
}

/** Wall time in ms of one call to `fn`. */
function timed(fn: () => void): number {
  const start = performance.now();
  fn();
  return performance.now() - start;
}

function sample(before: () => void, fn: () => void): number[] {
  const out: number[] = [];
  for (let i = 0; i < RUNS; i += 1) {
    before();
    out.push(timed(fn));
  }
  return out;
}

function report(label: string, limitMs: number | null, ms: number[]): void {
  const sorted = [...ms].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
  const max = sorted[sorted.length - 1] ?? 0;
  const limit = limitMs === null ? "no limit" : `limit ${String(limitMs)} ms`;
  console.log(
    `[timing] ${label}: median ${median.toFixed(1)} ms, max ${max.toFixed(1)} ms, ${String(ms.length)} runs (${limit})`,
  );
}

function buildCopy(): void {
  const list = spawnSync("git", ["ls-files", "-z"], {
    cwd: REPO,
    encoding: "utf8",
    maxBuffer: 1 << 26,
  });
  if (list.status !== 0) throw new Error(`git ls-files failed: ${list.stderr}`);
  for (const file of list.stdout.split("\0").filter((f) => f !== "")) {
    const from = join(REPO, file);
    const to = join(copy, file);
    if (!existsSync(from)) continue; // tracked but deleted in the working tree
    mkdirSync(dirname(to), { recursive: true });
    cpSync(from, to, { dereference: false });
  }
  cpSync(join(REPO, PROV), join(copy, PROV), { recursive: true });
  rmSync(join(copy, PROV, "state.json"), { force: true });
  rmSync(join(copy, PROV, "lock"), { force: true });
  run("git", ["init", "-q", "--template="]);
  run("git", ["add", "-A"]);
  run("git", [
    "-c",
    "user.name=t",
    "-c",
    "user.email=t@example.invalid",
    "commit",
    "-q",
    "-m",
    "copy",
  ]);
}

const bundle = (): string => join(copy, PROV, "provenance.mjs");
const record = (event: string) => (): void => {
  run("node", [bundle(), "record", event], PAYLOAD);
};

describe.skipIf(!ENABLED)("recorder timing (set PROVENANCE_TIMING=1 to run)", () => {
  beforeAll(() => {
    if (resolve(tmpdir()).startsWith(REPO))
      throw new Error("temp directory is inside the repository");
    home = mkdtempSync(join(tmpdir(), "reveal-timing-home-"));
    copy = mkdtempSync(join(tmpdir(), "reveal-timing-copy-"));
    buildCopy();
    record("promptSubmit")(); // settles the copy's state so later runs see no change
  }, 600_000);

  afterAll(() => {
    if (copy !== "") rmSync(copy, { recursive: true, force: true });
    if (home !== "") rmSync(home, { recursive: true, force: true });
  });

  it("node floor", () => {
    report(
      "node -e ''",
      null,
      sample(
        () => undefined,
        () => {
          run("node", ["-e", ""]);
        },
      ),
    );
  });

  it("promptSubmit, no file changed", () => {
    report(
      "promptSubmit, no change",
      500,
      sample(() => undefined, record("promptSubmit")),
    );
  });

  it("agentStop, no change", () => {
    report(
      "agentStop, no change",
      1500,
      sample(() => undefined, record("agentStop")),
    );
  });

  it("promptSubmit, state.json removed", () => {
    const gone = (): void => {
      rmSync(join(copy, PROV, "state.json"), { force: true });
    };
    report("promptSubmit, no state.json", 5000, sample(gone, record("promptSubmit")));
  }, 600_000);

  it("provenance baseline on the copy's tracked files", () => {
    const reset = (): void => {
      rmSync(join(copy, PROV, "baseline.json"), { force: true });
      rmSync(join(copy, PROV, "cache"), { recursive: true, force: true });
    };
    report(
      "baseline",
      10_000,
      sample(reset, () => {
        run("node", [bundle(), "baseline"]);
      }),
    );
  }, 900_000);

  it("one Engine apply on 194,104 characters", () => {
    const at = "2026-11-19T00:00:00.000Z";
    const created = createDocument("a".repeat(194_104), at);
    if (!created.ok) throw new Error("createDocument failed");
    const op = {
      kind: "insert",
      at: 97_052,
      text: "x",
      provenance: { origin: "HUM", timestamp: at },
    } as const;
    const ms = sample(
      () => undefined,
      () => {
        const r = apply(created.value, op);
        if (!r.ok) throw new Error("apply failed");
      },
    );
    report("Engine apply, 194,104 chars", null, ms);
  });
});
