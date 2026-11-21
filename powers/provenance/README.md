# Provenance, a Kiro Power

This Power records which text in your source files the Kiro agent changed, and which text was changed while no agent window was open. `reveal <file>` shows the result as codes in front of the text, in the manner of WordPerfect's Reveal Codes.

It is part of [Reveal Codes](../../README.md). It works in any Kiro workspace. No prompt text is stored and nothing leaves the machine.

## Import it

1. In Kiro, open the Powers panel and choose Add Custom Power.
2. Choose Import power from a folder and select this folder (`powers/provenance`), or choose Import power from GitHub and give the repository URL, `https://github.com/gowtham0992/reveal-codes`.
3. In a workspace, say "set up provenance". The agent asks first, then calls `setup_provenance`.
4. Check the Agent Hooks panel. Setup writes the hooks, and they may not be running yet.
5. Trust the workspace if Kiro asks. On the CLI, use `kiro-cli chat --trust-workspace`: hooks from a folder load only once the folder is trusted.
6. Switch on any Provenance hook that the panel shows as disabled.
7. Reload the window (`Developer: Reload Window`).
8. Send one prompt, and let the setup skill check with `check_records` that a hook event arrived.

Node 20 or newer must be on the path. Nothing else is installed: the server, the recorder and the reveal command are one file, `server/provenance.mjs`. Windows is not supported.

## After a rebuild: remove the Power and import it again

Kiro copies an imported Power to `~/.kiro/powers/installed/<name>`. That copy keeps the old bundle after you rebuild `server/provenance.mjs` in this folder. To use a rebuilt Power, remove it in the Powers panel and import the folder again. Then ask Kiro to set up provenance again: setup refreshes `provenance.mjs` and `reveal` in the workspace and never re-baselines.

## What setup writes

Setup writes into the workspace, because a Power cannot carry hooks:

- `.kiro/hooks/0-provenance.json`, the hooks that run the recorder;
- `.kiro/provenance/`, holding a copy of `provenance.mjs`, the `reveal` wrapper, the baseline, the sessions count, the ignore file and, as files change, one record per file.

Setup never writes `.kiroignore`. Running it again never re-baselines: it only refreshes `provenance.mjs` and `reveal`. A git pre-commit hook is offered and written only if you say yes.

## The three commands

Run from the workspace root, as `.kiro/provenance/reveal …` or `node .kiro/provenance/provenance.mjs reveal …`:

- `reveal <file>` prints the file with its codes.
- `reveal --summary [path]` prints the share of each origin, the longest untouched agent stretches and the agent windows.
- `reveal --check [--strict]` checks the records for damage.

## The legend

- `[AI:<tag>]` changed while the agent was working, with the run it belongs to.
- `[AI>HUM:<tag>]` agent text in a run that the Engine counts as edited while no agent window was open.
- `[HUM]` changed while no agent window was open; typing, pasting and other tools are not told apart.
- `[PST]` already in the file when recording started; origin not recorded.

## What the record cannot know

- It starts on the day of setup. Text already in the files is `[PST]`.
- A file has no record until it first changes.
- `[HUM]` does not say a person typed the text. It may be a paste, a `git pull` or another tool.
- `[AI]` includes the output of commands the agent ran, such as a formatter.
- A change a person saves while the agent is working counts as the agent's.
- When two sessions work at once, which window a change belongs to is a rule and not a fact.
- In a session with no prompt events, such as a spec chat that runs tasks, an edit the agent makes between tasks is recorded as `[HUM]`.
- The record is not proof that no AI wrote a passage.

## When the hooks are disabled

After setup the hooks may not be running. In the IDE, Kiro has shown them as `(disabled)` in the Agent Hooks panel, and `kiro-cli chat --help` says of `--trust-workspace` that hooks from a folder load only once the folder is trusted. The cause of the disabled hooks in the IDE is not confirmed. Check the Agent Hooks panel, trust the workspace if Kiro asks, switch on each Provenance hook shown as disabled, reload the window, send one prompt and let the setup skill verify with `check_records` that an event arrived.

While no hook event has been recorded in the workspace, `reveal <file>`, `reveal --summary` and `reveal --record` print the line `No hook event has been recorded in this workspace. The Provenance hooks may be disabled; text changed since setup cannot be attributed to the agent.` first, and the four read tools return it as `warning`. Until a hook event arrives, text changed since setup cannot be attributed to the agent. The `check_records` tool also returns `hookEvents`, which says whether any hook event has arrived and when the last one did. The line cannot tell a disabled hook from a workspace in which no prompt has been sent yet.

## The record is committed

`.kiro/provenance/` is meant to be committed, so that the record travels with the repository. Its `.gitignore` leaves out only `state.json`, `errors.log`, the lock file and `cache/`.

## What is in this folder

| Path                              | What it is                                                         |
| --------------------------------- | ------------------------------------------------------------------ |
| `plugin.json`, `mcp.json`         | The manifest and the MCP server configuration. No hook component.  |
| `server/provenance.mjs`           | The built bundle. Generated by `pnpm power:build`; do not edit it. |
| `skills/setup-provenance/`        | Asks first, then installs the recorder and says what it wrote.     |
| `skills/reveal-codes-for-source/` | Answers "which parts have I not touched since you wrote them?".    |

After a change to `packages/provenance`, run `pnpm power:build` and commit the result.
