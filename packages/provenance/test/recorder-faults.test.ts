import { spawn } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
/**
 * The real entry `src/cli/main.ts` as a child process in temporary directories (Req 7.1 to 7.5,
 * 5.14, 5.17, 5.18, 16.9). `jiti/register` is the repo's TypeScript runner for node entries.
 */
const ENTRY = fileURLToPath(new URL("../src/cli/main.ts", import.meta.url));
const JITI = import.meta.resolve("jiti/register");
const SECRET_PROMPT = "SECRET-PROMPT-7731";
const SECRET_TEXT = "SECRET-FILE-TEXT-4410";
const LINE =
  /^\d{4}-\d{2}-\d{2}T\S+ (promptSubmit|agentStop|preTask|postTask|manual|unknown) \S+ \S+$/u;

type Run = { status: number | null; stdout: Buffer; stderr: Buffer; ms: number };

/** Runs `provenance record <event>` in `cwd`. `stdin` null leaves the pipe open and never closes it. */
function run(cwd: string, event: string, stdin: string | null): Promise<Run> {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--import", JITI, ENTRY, "record", event], {
      cwd,
      stdio: ["pipe", "pipe", "pipe"],
    });
    const out: Buffer[] = [];
    const errs: Buffer[] = [];
    child.stdout.on("data", (b: Buffer) => out.push(b));
    child.stderr.on("data", (b: Buffer) => errs.push(b));
    child.on("error", reject);
    child.on("close", (status) => {
      resolve({
        status,
        stdout: Buffer.concat(out),
        stderr: Buffer.concat(errs),
        ms: Date.now() - started,
      });
    });
    if (stdin !== null) child.stdin.end(stdin);
  });
}

const payload = JSON.stringify({ session_id: "s-fault", prompt: SECRET_PROMPT });

function expectSilentExitZero(result: Run): void {
  expect(result.status).toBe(0);
  expect(result.stdout.length).toBe(0);
  expect(result.stderr.length).toBe(0);
}

let base = "";
let counter = 0;

/** A fresh workspace with a Record_Directory and one file. */
function workspace(): { root: string; prov: string; log: () => string[] } {
  const root = join(base, `ws${String((counter += 1))}`);
  const prov = join(root, ".kiro", "provenance");
  mkdirSync(prov, { recursive: true });
  writeFileSync(join(root, "a.txt"), `${SECRET_TEXT}\n`);
  const log = (): string[] => {
    const file = join(prov, "errors.log");
    return existsSync(file)
      ? readFileSync(file, "utf8")
          .split("\n")
          .filter((l) => l !== "")
      : [];
  };
  return { root, prov, log };
}

const timed = run;

function reasons(lines: string[]): string[] {
  return lines.map((l) => l.split(" ")[3] ?? "");
}

function expectNoSecrets(lines: string[]): void {
  for (const line of lines) {
    expect(line).toMatch(LINE);
    expect(line).not.toContain(SECRET_PROMPT);
    expect(line).not.toContain(SECRET_TEXT);
    expect(line).not.toContain("s-fault");
  }
}

beforeAll(() => {
  base = mkdtempSync(join(tmpdir(), "reveal-faults-"));
});
afterAll(() => {
  rmSync(base, { recursive: true, force: true });
});

describe("the record command's silence and exit status (_Requirements: 5.14, 5.17, 5.18, 7.1, 7.2, 7.3, 7.4, 7.5, 16.9_)", () => {
  it("a tampered Record is left byte for byte, logs tampered_record and prints nothing", async () => {
    const ws = workspace();
    expectSilentExitZero(await timed(ws.root, "manual", null));
    const record = join(ws.prov, "records", "a.txt.reveal");
    const whole = readFileSync(record);
    expect(whole.length).toBeGreaterThan(20);
    const truncated = whole.subarray(0, Math.floor(whole.length / 2));
    writeFileSync(record, truncated);
    writeFileSync(join(ws.root, "a.txt"), `${SECRET_TEXT}\nmore\n`);
    const result = await timed(ws.root, "promptSubmit", payload);
    expectSilentExitZero(result);
    expect(readFileSync(record).equals(truncated)).toBe(true);
    expect(reasons(ws.log())).toEqual(["tampered_record"]);
    expectNoSecrets(ws.log());
  });

  it("an unparseable state.json logs bad_state and the run still records the file", async () => {
    const ws = workspace();
    writeFileSync(join(ws.prov, "state.json"), "{not json");
    const result = await timed(ws.root, "agentStop", payload);
    expectSilentExitZero(result);
    expect(reasons(ws.log())).toContain("bad_state");
    expectNoSecrets(ws.log());
    expect(existsSync(join(ws.prov, "records", "a.txt.reveal"))).toBe(true);
  });

  it("an unparseable baseline.json logs bad_baseline and prints nothing", async () => {
    const ws = workspace();
    writeFileSync(join(ws.prov, "baseline.json"), "\u0000garbage");
    const result = await timed(ws.root, "manual", null);
    expectSilentExitZero(result);
    expect(reasons(ws.log())).toContain("bad_baseline");
    expectNoSecrets(ws.log());
  });

  it.skipIf(process.getuid?.() === 0 || process.platform === "win32")(
    "an unwritable Record_Directory exits 0 with no output and discards the fault line",
    async () => {
      const ws = workspace();
      writeFileSync(join(ws.prov, "state.json"), "{not json");
      chmodSync(ws.prov, 0o500);
      try {
        const result = await timed(ws.root, "promptSubmit", payload);
        expectSilentExitZero(result);
      } finally {
        chmodSync(ws.prov, 0o700);
      }
      expect(ws.log()).toEqual([]);
      expect(readFileSync(join(ws.prov, "state.json"), "utf8")).toBe("{not json");
    },
  );

  it("a missing Record_Directory exits 0 with no output and creates nothing", async () => {
    const root = join(base, `bare${String((counter += 1))}`);
    mkdirSync(root, { recursive: true });
    writeFileSync(join(root, "a.txt"), `${SECRET_TEXT}\n`);
    const result = await timed(root, "promptSubmit", payload);
    expectSilentExitZero(result);
    expect(existsSync(join(root, ".kiro"))).toBe(false);
  });

  it("an unknown event name logs one unknown_event line and nothing else", async () => {
    const ws = workspace();
    const result = await timed(ws.root, "frobnicate", payload);
    expectSilentExitZero(result);
    const lines = ws.log();
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/^\S+ unknown - unknown_event$/u);
    expect(lines[0]).not.toContain("frobnicate");
    expect(existsSync(join(ws.prov, "state.json"))).toBe(false);
  });

  it("a stdin that never closes returns within about 2 seconds, silent, with the file recorded", async () => {
    const ws = workspace();
    const result = await timed(ws.root, "promptSubmit", null);
    expectSilentExitZero(result);
    expect(result.ms).toBeLessThan(4000);
    expectNoSecrets(ws.log());
    expect(existsSync(join(ws.prov, "records", "a.txt.reveal"))).toBe(true);
  });
});
