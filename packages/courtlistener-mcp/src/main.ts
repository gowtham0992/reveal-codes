import { homedir } from "node:os";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { buildContext } from "./context";
import { readEnv } from "./env";
import { createServer } from "./server";

/** Entry point and the only module that touches `process`: stdout carries protocol messages only. */
async function main(): Promise<void> {
  const env = readEnv(process.env, homedir());
  const ctx = buildContext(env);
  const server = createServer(ctx);
  await server.connect(new StdioServerTransport());
  ctx.log(`courtlistener-mcp ready${env.fixturesOnly ? " (fixtures only)" : ""}`);
}

main().catch((cause: unknown) => {
  const token = process.env["COURTLISTENER_TOKEN"];
  const text = cause instanceof Error ? cause.message : String(cause);
  const safe = token === undefined || token === "" ? text : text.split(token).join("[redacted]");
  process.stderr.write(`courtlistener-mcp: fatal: ${safe}\n`);
  process.exit(1);
});
