/**
 * The no-event warning (Req 9.19, 12.15; design M17): one line, printed by `reveal <file>`,
 * `reveal --summary` and `reveal --record` and returned by the four read tools, while `state.json`
 * holds no `lastHookEventAt`. The line cannot tell a disabled hook from a workspace in which no
 * prompt has been sent yet, which is why it says "may be disabled".
 */
export const NO_HOOK_EVENT_LINE =
  "No hook event has been recorded in this workspace. The Provenance hooks may be disabled; text changed since setup cannot be attributed to the agent.";
/** The warning line while no hook event has been recorded, else `null`. */
export function hookWarning(lastHookEventAt: string | null): string | null {
  return lastHookEventAt === null ? NO_HOOK_EVENT_LINE : null;
}
