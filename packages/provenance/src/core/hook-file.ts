type HookSpec = {
  readonly name: string;
  readonly trigger: "UserPromptSubmit" | "Stop" | "PreTaskExec" | "PostTaskExec";
  readonly event: "promptSubmit" | "agentStop" | "preTask" | "postTask";
};

/** The four hooks of the Hook_File, in file order (Req 8.1, 8.3). */
const HOOKS: readonly HookSpec[] = [
  { name: "Provenance: prompt", trigger: "UserPromptSubmit", event: "promptSubmit" },
  { name: "Provenance: stop", trigger: "Stop", event: "agentStop" },
  { name: "Provenance: task start", trigger: "PreTaskExec", event: "preTask" },
  { name: "Provenance: task end", trigger: "PostTaskExec", event: "postTask" },
];

function commandFor(event: string): string {
  return `node .kiro/provenance/provenance.mjs record ${event} >/dev/null 2>&1 || true`;
}

/**
 * The exact content of `.kiro/hooks/0-provenance.json` (Req 8.1 to 8.3, 8.9, 7.11).
 * `timeout` is in seconds; there is no `timeout_ms`, no `matcher`, and standard
 * input is not redirected because the payload arrives on it.
 */
export function hookFileText(): string {
  const hooks = HOOKS.map((h) => ({
    name: h.name,
    trigger: h.trigger,
    timeout: 30,
    enabled: true,
    action: { type: "command", command: commandFor(h.event) },
  }));
  return `${JSON.stringify({ version: "v1", hooks }, null, 2)}\n`;
}
