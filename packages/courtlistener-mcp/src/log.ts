/** Logging: stderr only, so stdout carries MCP protocol messages alone (Req 13.13, 13.14). */
export type LogSink = (line: string) => void;
export type Log = (line: string) => void;

/** Replaces every occurrence of `token` by `[redacted]`. An absent or empty token changes nothing. */
export function redact(text: string, token: string | undefined): string {
  return token === undefined || token === "" ? text : text.split(token).join("[redacted]");
}

/** The default sink: one line per call on standard error. */
export const stderrSink: LogSink = (line) => {
  process.stderr.write(`${line}\n`);
};

export function createLog(token: string | undefined, sink: LogSink = stderrSink): Log {
  return (line) => {
    sink(redact(line, token));
  };
}
