import type { Deps, FetchLike } from "@reveal-codes/verifier";
import { basename, join } from "node:path";
import { parseArgs, USAGE } from "./args.js";
import type { Command } from "./args.js";
import { buildDeps } from "./deps.js";
import type { SentinelEnv } from "./deps.js";
import type { FilePort } from "./files.js";
import { redact } from "./redact.js";
import { renderJson, renderReport } from "./report.js";
import { analyseAll, selectFiles } from "./sweep.js";
import type { Target } from "./sweep.js";
import type { Clock } from "./types.js";

export type RunIo = Readonly<{
  env: SentinelEnv;
  fetch: FetchLike;
  now: Clock;
  sleep: Deps["sleep"];
  homeDir: string;
  files: FilePort;
  stdout(text: string): void;
  stderr(text: string): void;
}>;

function operand(command: Command): string {
  return command.kind === "sweep" ? command.dir : command.file;
}

/** Exit code 2 and a message when the operand is not the right kind of path; otherwise null. */
async function operandProblem(command: Command, io: RunIo): Promise<string | null> {
  const path = operand(command);
  const kind = await io.files.kind(path);
  if (command.kind === "sweep") {
    return kind === "directory" ? null : `sentinel: not a directory: ${path}\n`;
  }
  return kind === "file" ? null : `sentinel: not a file: ${path}\n`;
}

async function targetsOf(command: Command, io: RunIo): Promise<readonly Target[]> {
  if (command.kind === "check") return [{ file: basename(command.file), path: command.file }];
  const names = selectFiles(await io.files.list(command.dir));
  return names.map((name) => ({ file: name, path: join(command.dir, name) }));
}

async function writeOutputs(
  command: Command,
  io: RunIo,
  markdown: string,
  json: string,
): Promise<void> {
  if (command.out === null) io.stdout(markdown);
  else await io.files.write(command.out, markdown);
  if (command.json !== null) await io.files.write(command.json, json);
}

async function sweepAndWrite(command: Command, io: RunIo): Promise<void> {
  const sweptAt = io.now();
  const { mode, deps } = buildDeps(io.env, io);
  const files = await analyseAll(await targetsOf(command, io), io.files, deps);
  const report = { sweptAt, mode, files };
  await writeOutputs(command, io, renderReport(report), renderJson(report));
}

/** Runs one command. Returns the exit code: 0 done, 1 unexpected error, 2 usage or bad operand. */
export async function run(argv: readonly string[], io: RunIo): Promise<number> {
  try {
    const parsed = parseArgs(argv);
    if (!parsed.ok) {
      io.stderr(`${parsed.error.message}\n${USAGE}\n`);
      return 2;
    }
    const problem = await operandProblem(parsed.value, io);
    if (problem !== null) {
      io.stderr(problem);
      return 2;
    }
    await sweepAndWrite(parsed.value, io);
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    io.stderr(`sentinel: ${redact(message, io.env["COURTLISTENER_TOKEN"])}\n`);
    return 1;
  }
}
