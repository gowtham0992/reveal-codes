# Requirements Document

## Introduction

This feature records, in any workspace, which text in each source file Kiro's agent changed, and shows that record in Reveal Codes form. The Recorder is a command that Kiro's own hooks run at four events. At each event it compares every changed file with the last state it recorded and applies the difference to that file's Record through the existing Engine (`createDocument`, `apply`, `renderRecord`, `parseRecord`). The Record uses the same form as the Provenance Appendix: the Engine's full Reveal Codes rendering. Nothing about provenance is guessed from the text. Product principle 1 binds this spec: provenance is captured, never inferred, and where the Recorder cannot know, it says so.

A file gets a Record only when it first changes. Until then the Baseline_File holds the file's path and SHA-256 digest, and the file is shown as `[PST]`. A Record starts from the file's text as of the baseline, as `[PST]`, with the first change applied to it. Because the Baseline_File stores only a digest, the Recorder must find the baseline text somewhere else when the first change arrives. Requirement 5 states where it looks and what it does when it finds nothing; the consequence is stated in Decision 1.

Two windows are told apart by the hook events and never by looking at the text. A change that appears between Prompt Submit and Agent Stop, or between Pre Task Execution and Post Task Execution, is a change made while the agent was working. A change that appears outside those windows is a change made outside the agent. The legend for source files states only that. It does not claim that the agent's model wrote every character of an Agent_Change (a formatter or shell command the agent ran produces Agent_Changes too), and it does not claim that a person typed an Outside_Change (it may be a paste, a `git pull`, or another tool).

The feature ships four things. The first is a new package `packages/provenance` (`@reveal-codes/provenance`) that holds the Recorder and the viewer. The second is a command, `reveal`, with three forms: a file with its codes inline, a summary, and a check. The third is a set of MCP tools that answer from the Record and return structured spans, not the model's memory. The fourth is a Power, `powers/provenance`, built and bundled the way `powers/citation-check` is, whose skill installs the whole thing in a workspace. A Power cannot carry hooks (see Decision 5), so the skill writes the hook file and says what it wrote.

This repository uses the feature from the start of the install task. Text that was in a file before the baseline is `[PST]`. The record starts on the day it was installed, and the documentation says so. Windows is not supported, and the README says so.

This spec changes no behavior of the web app, the Verifier, the exported filing format, or the Engine. The Engine keeps zero runtime dependencies. The commit-on-task hook keeps working.

Measurements taken on this repository on 2026-11-18, on an Apple M4 with Node 22.23.4, are the basis of the time limits below: 1,060 files are tracked and 7.0 million characters are in the 1,055 text files of 200,000 characters or fewer; hashing every such file takes 0.2 s and a cold `node` process that scans them takes 0.27 s in total; creating, rendering and parsing a Record for all 1,055 files takes 2.0 s in total, and the slowest file (`.kiro/specs/case-match/design.md`) takes 59 ms; one Engine `apply` on a 194,104-character file takes 2 ms. Under this spec only changed files get a Record, so the Record store is smaller than the 7.14 million characters that Records for all 1,055 files would have taken.

The answers to the questions that were open before design are recorded in the Decisions section at the end of this document. Each requirement that depends on an answer names it.

## Glossary

- **Engine**: `packages/engine`, `@reveal-codes/engine`. Its public entry points used here are `createDocument`, `apply`, `renderRecord`, `parseRecord`, `render` and `DEFAULT_RELABEL_THRESHOLD`.
- **Provenance_Package**: `packages/provenance`, `@reveal-codes/provenance`, the new package that holds the Recorder, the viewer, the summary, the check and the MCP server source.
- **Recorder**: the part of the Provenance_Package run by `provenance record <event>` that updates Records.
- **Reveal_Command**: the command line program `reveal` with the forms `reveal <file>`, `reveal --summary [path]` and `reveal --check [--strict]`, and the entry `reveal --record`.
- **Bundle**: the one file `provenance.mjs` that contains the Recorder, the Reveal_Command and the MCP server with no dependency to install.
- **Provenance_Power**: the directory `powers/provenance`, a Kiro Power that follows the Agent Plugins layout (`plugin.json`, `mcp.json`, `skills/`).
- **Setup_Skill**: the skill `skills/setup-provenance/SKILL.md` of the Provenance_Power.
- **Provenance_Tools**: the MCP tools exposed by the Bundle.
- **Workspace_Root**: the directory that holds the Record_Directory; the directory in which Kiro runs a command hook.
- **Record_Directory**: `.kiro/provenance/` under the Workspace_Root, committed (Decision 1).
- **Record**: one file under `<Record_Directory>/records/<workspace-relative path>.reveal` that holds the Engine's full rendering (`renderRecord(doc, null, "full")`) of one tracked file. A Record exists only for a file that has changed since the baseline or that appeared after it. Its parsed Document text is the Recorded_Text.
- **Recorded_Text**: the `text` of the Document that `parseRecord` returns for a Record.
- **Baseline_File**: `<Record_Directory>/baseline.json`, the committed file that holds the time of the baseline and, for each Baseline_Entry, a workspace-relative path and the SHA-256 digest of the file's text at the baseline.
- **Baseline_Entry**: one path and digest in the Baseline_File. A Tracked_File has a Baseline_Entry only while it has no Record.
- **Unchanged_File**: a Tracked_File that has a Baseline_Entry, no Record, and a SHA-256 digest of its current text equal to the digest of the Baseline_Entry. The Reveal_Command shows it as `[PST]`.
- **Baseline_Text**: the text that a file had when the baseline was made. The Recorder never stores it; it finds it when a first change arrives (Requirement 5, criterion 5).
- **First_Change**: the first Agent_Change or Outside_Change that the Recorder finds at an event for a Tracked_File that has a Baseline_Entry and no Record.
- **Tracked_File**: a file that the Recorder keeps a Record or a Baseline_Entry for (Requirement 2).
- **Hook_Event**: one of `promptSubmit`, `agentStop`, `preTask`, `postTask`, named on the command line of the hook (`provenance record <event>`) and never read from standard input, or `manual`, named by `reveal --record` and by the git pre-commit hook of this repository.
- **Agent_Window**: the interval from a `promptSubmit` event to the next `agentStop` event, or from a `preTask` event to the next `postTask` event.
- **Window_State**: the file `<Record_Directory>/state.json` that holds the open windows, the cache of last-seen file digests and the clock reading of the last event.
- **Window_Run**: the name given to one Agent_Window. It contains the Run_Label and the UTC time at which the window opened, to the second.
- **Run**: the Engine's Run_Id string given to every `AI` insertion of one Hunk of one Agent_Change. A Run name is the Window_Run, a `.`, and the Hunk number; the Hunk number is the digits after the last `.`.
- **Run_Label**: the task title when the hook payload carries one, else the word `turn`.
- **Agent_Change**: a difference between a file and its Record, or its Baseline_Text, that the Recorder finds at an event that closes an Agent_Window.
- **Outside_Change**: a difference between a file and its Record, or its Baseline_Text, that the Recorder finds at any other event.
- **Hunk**: one contiguous replacement in the line-based difference between the Recorded_Text, or the Baseline_Text, and the current file text.
- **Origin**: one of `HUM`, `PST`, `AI`, `AI>HUM`, as defined in `product.md`.
- **Source_Legend**: the wording of the four Origins for source files (Requirement 9, criterion 3).
- **Untouched_Stretch**: a maximal run of consecutive `AI` characters in one Record, that is, an `AI` Span of the Record's canonical Document.
- **Changed_Characters**: for a file whose text differs from what is recorded, the sum of the lengths of the replacement texts and of the deleted texts of the Hunks; for a file with a Baseline_Entry whose Baseline_Text cannot be found, the length of the whole file text.
- **Fault_Log**: the file `<Record_Directory>/errors.log`.
- **Kiro_Ignore_File**: the file `.kiroignore` at the Workspace_Root.
- **Hook_File**: the file `.kiro/hooks/provenance.json`.
- **Size_Limit**: 200,000 UTF-16 code units of decoded text per file (Decision 11).
- **Hook_Deadline**: 20 seconds of wall-clock time for one Recorder run.
- **Stale_Record**: a file whose text differs from what the Record, or the Baseline_Entry, describes because the file changed after the last event.
- **Tampered_Record**: a Record that `parseRecord` rejects, or whose Document does not satisfy the Engine's own checks.
- **Structured_Span**: a JSON object `{ startLine, startColumn, endLine, endColumn, length, origin, run, taskTitle }` with 1-based lines, 1-based columns counted in UTF-16 code units, an end position that is exclusive, `run` and `taskTitle` equal to `null` for `HUM` and `PST`.
- **Probe**: the temporary hook of Requirement 18 that records field names, field types and title fields of hook payloads, and nothing else.

## Requirements

### Requirement 1: Package, dependencies and boundaries

**User Story:** As a maintainer, I want the feature in one new package with explicit dependencies, so that the Engine, the web app, the Verifier and the export format stay as they are.

#### Acceptance Criteria

1. THE Provenance_Package SHALL live in `packages/provenance` under the name `@reveal-codes/provenance`.
2. THE Provenance_Package SHALL declare `@reveal-codes/engine` (`workspace:*`) as a runtime dependency and SHALL import the Engine only through its public entry point.
3. THE Provenance_Package SHALL declare as runtime dependencies no package other than `@reveal-codes/engine`, plus a text-difference library only if the design shows that a hand-written line difference cannot meet Requirement 4; the library SHALL be pinned to an exact version.
4. THE Engine SHALL keep zero runtime dependencies and SHALL receive no source change from this spec.
5. THE Provenance_Package SHALL contain the pure functions (difference, attribution, summary, check, view) in modules that import no `node:` module, and SHALL contain the file system, process, git and clock access in a small set of modules that receive them as injected values.
6. THE Provenance_Package SHALL use named exports only, plain data types and discriminated unions in place of classes, and no `any`.
7. THE Provenance_Package SHALL return `Result` values in place of thrown errors in every function except the command entry modules, SHALL limit each function to 40 lines or fewer and each module to 300 lines or fewer.
8. THE Provenance_Package SHALL reference `process.env` in exactly one module.
9. THE Provenance_Package SHALL make no network request and SHALL send no data anywhere.
10. THE Provenance_Package SHALL add no file under `apps/web`, `packages/verifier`, `packages/export` or `crew/sentinel`, and SHALL change no file there.
11. THE root `package.json` SHALL define the script `reveal` that runs the Reveal_Command from this repository's sources, and SHALL keep every existing script unchanged.

### Requirement 2: Which files are tracked

**User Story:** As a developer, I want the record to cover the text files that are part of my project and nothing else, so that the record stays small and holds nothing that does not belong in it.

#### Acceptance Criteria

1. WHERE the Workspace_Root is a git working tree and `git` is on the path, THE Recorder SHALL take the candidate files from `git ls-files --cached --others --exclude-standard`.
2. WHERE the Workspace_Root is not a git working tree or `git` is not on the path, THE Recorder SHALL take the candidate files from a walk of the Workspace_Root that skips the directories `.git`, `node_modules`, `dist`, `build`, `out`, `.next`, `coverage` and `target`, and SHALL apply no git ignore rule.
3. WHERE the Workspace_Root is a git working tree, THE Recorder SHALL exclude from the candidates every file that git ignores, including a tracked file that matches an ignore rule (the files that `git ls-files --cached --ignored --exclude-standard` lists).
4. THE Recorder SHALL exclude from the candidates every file under the Record_Directory.
5. THE Recorder SHALL exclude from the candidates the lockfiles `package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`, `bun.lock`, `Cargo.lock`, `Gemfile.lock`, `poetry.lock`, `composer.lock`, `go.sum` and every file whose name ends in `.lock`.
6. THE Recorder SHALL exclude from the candidates every file whose name ends in `.min.js`, `.min.css` or `.map`, and every file under a directory named `dist`, `build`, `out`, `.next`, `coverage` or `target`.
7. THE Recorder SHALL exclude from the candidates every file whose name is `.env` or begins with `.env.`, or ends in `.pem`, `.key`, `.p12` or `.pfx`, or begins with `id_rsa` or `id_ed25519`.
8. THE Recorder SHALL exclude from the candidates every file that matches a line of the Kiro_Ignore_File.
9. THE Kiro_Ignore_File SHALL hold one pattern per line, ignore blank lines and lines that begin with `#`, treat `*` as any run of characters other than `/`, `**` as any run of characters, `?` as one character other than `/`, and a trailing `/` as a directory, and SHALL match a pattern with no `/` against the file name at any depth.
10. IF a candidate file is larger than the Size_Limit after decoding, THEN THE Recorder SHALL skip the file and SHALL write one line naming the file and the reason `over_limit` to the Fault_Log.
11. IF a candidate file contains a NUL byte or its bytes are not valid UTF-8, THEN THE Recorder SHALL skip the file as a binary file and SHALL write no line to the Fault_Log for it.
12. WHEN a file that has a Record or a Baseline_Entry becomes excluded, over the Size_Limit or binary, or is deleted, THE Recorder SHALL delete its Record and its Baseline_Entry at the next event.
13. WHEN a file that has neither a Record nor a Baseline_Entry stops being excluded, or falls to the Size_Limit or below, THE Recorder SHALL treat it as a file that appeared at that event (Requirement 5, criteria 7 and 8).
14. THE Recorder SHALL treat a symbolic link as absent and SHALL never follow it.

### Requirement 3: The windows and the events

**User Story:** As a developer, I want the agent's changes told apart from mine by Kiro's own events, so that the record never depends on a guess about the text.

#### Acceptance Criteria

1. WHEN the Recorder is started as `provenance record <event>` with `<event>` equal to `promptSubmit`, `agentStop`, `preTask`, `postTask` or `manual`, THE Recorder SHALL treat that name as the Hook_Event and SHALL read no event name from standard input.
2. WHEN the Hook_Event is `promptSubmit` and no Agent_Window is open, THE Recorder SHALL record every difference found as an Outside_Change, then open an Agent_Window of Run_Label `turn`.
3. WHEN the Hook_Event is `preTask` and no Agent_Window is open, THE Recorder SHALL record every difference found as an Outside_Change, then open an Agent_Window whose Run_Label is the task title.
4. WHEN the Hook_Event is `preTask` and a `turn` Agent_Window is open, THE Recorder SHALL record every difference found as an Agent_Change of the `turn` window, then open an Agent_Window whose Run_Label is the task title above the `turn` window.
5. WHEN the Hook_Event is `postTask`, THE Recorder SHALL record every difference found as an Agent_Change of the innermost open Agent_Window, then close that window and leave open the window below it, if any.
6. WHEN the Hook_Event is `agentStop`, THE Recorder SHALL record every difference found as an Agent_Change of the innermost open Agent_Window, then close every open Agent_Window.
7. IF a `postTask` or `agentStop` event arrives when no Agent_Window is open, THEN THE Recorder SHALL record every difference found as an Outside_Change and SHALL write one line naming the event and the reason `no_open_window` to the Fault_Log.
8. IF a `promptSubmit` event arrives when an Agent_Window is already open, THEN THE Recorder SHALL record every difference found as an Outside_Change, close every open window, write one line naming the event and the reason `window_left_open` to the Fault_Log, and open a new `turn` window (Decision 7).
9. WHEN the Hook_Event is `manual` and no Agent_Window is open, THE Recorder SHALL record every difference found as an Outside_Change and SHALL open no window (Decision 2).
10. WHEN the Hook_Event is `manual` and an Agent_Window is open, THE Recorder SHALL record every difference found as an Agent_Change of the innermost open Agent_Window and SHALL leave every window open, so that a commit made in the middle of a window does not turn the agent's text into `[HUM]` (Decision 2).
11. THE Recorder SHALL name each Window_Run so that it is unique among the windows of the Record_Directory and contains the Run_Label and the UTC time at which its window opened, to the second, and SHALL include no part of any prompt text.
12. THE Recorder SHALL name each Run as the Window_Run, a `.`, and a Hunk number, where the Hunk number is 1 plus the count of Runs of that Window_Run that already exist in the same Record, taken in ascending order of file offset for the Hunks of one event (Decision 8).
13. WHEN the hook payload on standard input carries the title of a spec task in a field that the captured payloads of the real IDE and the real CLI show (Requirement 16, criterion 6), THE Recorder SHALL use that title, collapsed to one line of single spaces and cut to 80 characters, as the Run_Label.
14. IF the hook payload carries no task title, THEN THE Recorder SHALL use the Run_Label `task`.
15. THE Recorder SHALL read standard input for at most 1.5 seconds and SHALL continue with an empty payload when standard input is not closed, is empty, is not valid JSON, or is larger than 1 MiB.
16. THE Recorder SHALL read from the hook payload only the task title and the session identifier, and SHALL discard every other field, including any prompt.
17. THE Recorder SHALL write the Window_State to disk by writing a temporary file in the Record_Directory and renaming it over `state.json`.
18. WHEN two Recorder processes run at the same time in one Workspace_Root, THE Recorder SHALL take a lock in the Record_Directory before it reads or writes any Record, and SHALL give up after 5 seconds, write one line with the reason `lock_timeout` to the Fault_Log and exit with status 0 without changing any Record.

### Requirement 4: Applying a difference through the Engine

**User Story:** As a developer, I want every change applied to the record by the Engine's own operations, so that the record means what the Engine says it means and no second implementation of provenance exists.

#### Acceptance Criteria

1. THE Recorder SHALL decode a file as UTF-8 and SHALL keep a leading byte order mark, carriage returns and every other character in the text unchanged.
2. WHEN a tracked file's text differs from its Recorded_Text, or from its Baseline_Text on its First_Change, THE Recorder SHALL compute a line-based difference whose Hunks are replacements `[from, to) → text` over that earlier text, with every offset on a line boundary of that earlier text.
3. THE Recorder SHALL give each Hunk of an Agent_Change its own Run (Requirement 3, criterion 12) and SHALL apply the Hunks to the Document from the highest offset to the lowest, each through one Engine `apply` call of kind `insert`, `delete` or `replace`.
4. WHEN an Agent_Change inserts text, THE Recorder SHALL give the insertion the origin `AI`, the Run of its Hunk, and the clock reading of the event as timestamp.
5. WHEN an Outside_Change inserts text, THE Recorder SHALL give the insertion the origin `HUM` and the clock reading of the event as timestamp.
6. WHEN an Outside_Change deletes text, THE Recorder SHALL call `apply` with a `delete` whose actor is `HUM`, or with a `replace` whose provenance origin is `HUM`.
7. WHEN an Agent_Change deletes text, THE Recorder SHALL call `apply` with a `delete` whose actor is `AI`, or with a `replace` whose provenance origin is `AI`.
8. THE Recorder SHALL pass no `relabelThreshold` to `apply`, so that the Engine's default of `DEFAULT_RELABEL_THRESHOLD` (0.4) decides when a Run becomes `AI>HUM`; because each Run is one Hunk, the Engine relabels one Hunk's text and not a whole window (Decision 8).
9. THE Recorder SHALL create no `AI>HUM` Span itself; a Span of origin `AI>HUM` SHALL appear in a Record only as the Engine's own relabelling of a Run.
10. THE Recorder SHALL leave every character that no Hunk touches with the origin, Run and timestamp it had in the Record, or `PST` and the baseline time when the earlier text is a Baseline_Text.
11. IF an `apply` call returns an error, THEN THE Recorder SHALL leave that file's Record and Baseline_Entry as they were, write one line with the file path and the error kind to the Fault_Log, and continue with the next file.
12. THE Recorder SHALL write a Record only when the Document's `text` equals the file text that was read, and WHEN the file's modification time changed while the Recorder updated that file, THE Recorder SHALL keep the previous Record and Baseline_Entry and leave the file for the next event.
13. WHILE the time since the Recorder started is above the Hook_Deadline, THE Recorder SHALL stop starting new files, leave every unprocessed file's Record and Baseline_Entry as they were, and write one line with the reason `deadline` to the Fault_Log.
14. WHEN the Engine's citation layer finds citation-like text in a source file, THE Recorder SHALL keep that layer in the Record unchanged and SHALL set no verification result, override or quote check.

### Requirement 5: The record store and the baseline file

**User Story:** As a developer, I want a record only for files that changed, and a small committed baseline for the rest, so that the record store stays small and still reproduces every file.

#### Acceptance Criteria

1. THE Recorder SHALL keep at most one Record per Tracked_File at `<Record_Directory>/records/<workspace-relative path>.reveal`, with `/` as the separator on every platform, and SHALL keep a Baseline_Entry only for a Tracked_File that has no Record.
2. THE Recorder SHALL write each Record as `renderRecord(document, null, "full").text`, so that `parseRecord` of a Record returns the Document it was made from.
3. THE Recorder SHALL write each Record, and the Baseline_File, by writing a temporary file in the same directory and renaming it over the target, so that a killed process leaves either the old file or the new one.
4. THE Recorder SHALL write the Baseline_File as JSON with one Baseline_Entry per line, ordered by path, so that two branches that change different entries merge without conflict.
5. WHEN a First_Change is found, THE Recorder SHALL obtain the Baseline_Text in this order: first, WHERE the Workspace_Root is a git working tree, the blob of the path at `HEAD` if the SHA-256 digest of the blob's bytes equals the digest of the Baseline_Entry; second, the blob of the path in each of the 20 most recent commits that changed the path, newest first, with the same digest test; third, no text (Decision 1).
6. WHEN the Baseline_Text is found, THE Recorder SHALL create the Record by `createDocument(baselineText, baselineTime)`, so that every character has origin `PST`, then apply the Hunks of Requirement 4, then delete the Baseline_Entry in the same event.
7. IF the Baseline_Text is not found, THEN THE Recorder SHALL create the Record by `createDocument("", clock)` followed by one insertion of the whole current file text with the origin of the event (`AI` with the Run `<Window_Run>.1` for an Agent_Change, `HUM` for an Outside_Change), delete the Baseline_Entry, and write one line with the file path and the reason `baseline_text_unavailable` to the Fault_Log.
8. WHEN a Tracked_File appears that has neither a Record nor a Baseline_Entry and an Agent_Window is open at the event, THE Recorder SHALL create its Record by `createDocument("", clock)` followed by an `AI` insertion of the whole file text with the Run `<Window_Run>.1`.
9. WHEN a Tracked_File appears that has neither a Record nor a Baseline_Entry and no Agent_Window is open at the event, THE Recorder SHALL create its Record by `createDocument("", clock)` followed by a `HUM` insertion of the whole file text.
10. WHEN a Tracked_File that has a Record or a Baseline_Entry is gone at an event, THE Recorder SHALL delete its Record or its Baseline_Entry, and SHALL delete the directories under `records/` that the deletion leaves empty.
11. WHEN, at one event, a Record's file is gone and a new file without a Record has exactly the same decoded text and is not empty, THE Recorder SHALL move the Record to the new path and SHALL treat the move as a rename that changes no span.
12. WHEN, at one event, a Baseline_Entry's file is gone and a new file that has neither a Record nor a Baseline_Entry has a SHA-256 digest equal to that Baseline_Entry's digest, THE Recorder SHALL change only the path of that Baseline_Entry and SHALL create no Record.
13. THE Recorder SHALL treat a change of both name and content, or a rename whose text matches more than one gone file, as a deletion followed by a creation.
14. IF a Record cannot be parsed by `parseRecord`, THEN THE Recorder SHALL leave the Record file as it is, write one line with the file path and the reason `tampered_record` to the Fault_Log, and SHALL not write a new Record for that path until the Record has been removed by a person.
15. IF the text of a Tracked_File differs from what its Record or Baseline_Entry describes at an event, THEN THE Recorder SHALL record the difference at that event as Requirement 3 states, so that, after the event, the Recorded_Text equals the file text or, for a file with a Baseline_Entry, the digest of the file text equals the digest of the Baseline_Entry.
16. THE Recorder SHALL keep in `state.json`, per file, the size, modification time and SHA-256 digest of the text it last recorded or checked, and SHALL skip a file whose size and modification time match; WHEN `state.json` is absent or unreadable, THE Recorder SHALL compare every file with its Record or Baseline_Entry.
17. THE Recorder SHALL treat a `state.json` that cannot be parsed as absent, SHALL write one line with the reason `bad_state` to the Fault_Log, and SHALL close every Agent_Window that it held.
18. IF the Baseline_File cannot be parsed, THEN THE Recorder SHALL leave it as it is, write one line with the reason `bad_baseline` to the Fault_Log, and SHALL create no Record that depends on a Baseline_Entry until a person has repaired or removed the Baseline_File.

### Requirement 6: The baseline

**User Story:** As a developer, I want the record to start from a plain baseline, so that text that was already in a file is never described as written by anyone.

#### Acceptance Criteria

1. WHEN `provenance baseline` runs and a Tracked_File has neither a Record nor a Baseline_Entry, THE Recorder SHALL add a Baseline_Entry with the SHA-256 digest of the file's current text, and SHALL create no Record.
2. WHEN `provenance baseline` runs and a Tracked_File has a Record or a Baseline_Entry, THE Recorder SHALL leave that Record and that Baseline_Entry unchanged.
3. THE Recorder SHALL write the clock reading of the baseline once into the Baseline_File as `at`, in the form `{ "version": 1, "at": "<ISO 8601 UTC>", "files": { ... } }`, and SHALL leave `at` unchanged on a second run.
4. WHEN `provenance baseline` finishes, THE Recorder SHALL print one line to standard output that gives the number of Baseline_Entries added and the number of files skipped, and no other output; this is the only command that prints on success besides the Reveal_Command forms.
5. THE Recorder SHALL finish the baseline of this repository (1,055 files) in 10 seconds or less on the hardware named in the Introduction.

### Requirement 7: Hooks that are invisible and cannot break a session

**User Story:** As a developer, I want the hooks to cost me nothing and never stop my work, so that I can leave recording on.

#### Acceptance Criteria

1. WHEN `provenance record <event>` runs, THE Recorder SHALL write nothing to standard output.
2. WHEN `provenance record <event>` runs, THE Recorder SHALL write nothing to standard error.
3. THE Recorder SHALL exit with status 0 for every input and every failure, including an unknown event name, a missing Record_Directory, a corrupt Record, an unreadable file, a full disk, an uncaught exception and an unhandled rejection.
4. IF any fault occurs while the Recorder runs, THEN THE Recorder SHALL append one line to the Fault_Log that holds the ISO 8601 time, the Hook_Event, the file path when one applies, and a reason code, and SHALL include in the line no file text, no prompt text and no payload field.
5. IF the Fault_Log cannot be written, THEN THE Recorder SHALL discard the line and still exit with status 0.
6. WHEN the Fault_Log is larger than 256 KiB, THE Recorder SHALL replace it with its last 128 KiB before it appends.
7. WHEN `provenance record promptSubmit` runs on this repository with no file changed since the last event, THE Recorder SHALL finish in 0.5 seconds or less, measured on the hardware named in the Introduction, because the event sits in front of every prompt (Decision 15).
8. WHEN `provenance record <event>` runs for any other event on this repository with no file changed since the last event, THE Recorder SHALL finish in 1.5 seconds or less, and WHEN it runs with no `state.json`, it SHALL finish in 5 seconds or less, both measured on the hardware named in the Introduction.
9. THE design SHALL report the typical time (the median of at least 20 runs) of a `promptSubmit` event with no change on this repository, and `BUILD_LOG.md` SHALL repeat it.
10. THE Recorder SHALL end its own run no later than the Hook_Deadline plus 2 seconds, which is below the 60-second default timeout of a Kiro command hook.
11. THE Hook_File SHALL set an explicit timeout of 30 seconds on each hook, in the field that the measurement of Requirement 18, criterion 5 shows the IDE honours (`timeout`, in seconds, or `timeout_ms`, in milliseconds), and WHERE that measurement does not determine the field, THE Hook_File SHALL include the documented `timeout`.

### Requirement 8: The hook file and the order with commit-on-task

**User Story:** As a developer, I want the recorder's hooks to sit beside my existing hooks without changing them, so that the commit after a spec task still works and contains the record of that task.

#### Acceptance Criteria

1. THE Hook_File SHALL define exactly four command hooks: trigger `PromptSubmit` running `provenance record promptSubmit`, trigger `Stop` running `provenance record agentStop`, trigger `PreTaskExec` running `provenance record preTask`, and trigger `PostTaskExec` running `provenance record postTask`.
2. THE command of each hook SHALL run the Bundle with `node` from the Workspace_Root, SHALL redirect standard output and standard error of the process to `/dev/null`, and SHALL end in `|| true`, so that a missing `node` or a missing Bundle leaves exit status 0.
3. THE Hook_File SHALL define no hook for any trigger other than the four of criterion 1 (Decision 6).
4. WHEN a spec task completes in a workspace that has both the Hook_File and `commit-on-task.json`, THE Recorder SHALL have finished recording the task before `scripts/commit-task.sh` runs `git add -A`, so that the Records changed by the task are in the task's commit.
5. THE spec SHALL establish by measurement in the IDE and in the CLI, and SHALL state in the design, the order in which two `PostTaskExec` hooks of different files run (Requirement 18, criterion 4).
6. IF the measurement does not show that the Recorder hook runs before `commit-on-task`, THEN THE spec SHALL add one line to `scripts/commit-task.sh` that runs `provenance record postTask` first, before `git add -A`, and the second run of that event SHALL change no Record (Requirement 16, Property 4) (Decision 13).
7. THE Hook_File SHALL leave `.kiro/hooks/commit-on-task.json` and every other existing hook file unchanged, including their timeout fields (Requirement 18, criterion 6).
8. WHEN the Record_Directory is under `.kiro/`, THE scope that `scripts/commit-task.sh` derives for a commit SHALL be the same as without the Record files, because that script ignores paths under `.kiro/`.

### Requirement 9: `reveal <file>`, the file with its codes inline

**User Story:** As a developer, I want to see a source file with provenance codes inline in my terminal, so that I can see who changed what, in the pane's look.

#### Acceptance Criteria

1. WHEN `reveal <file>` runs and the file has a Record whose Recorded_Text equals the file text, THE Reveal_Command SHALL print, under a header of one line that names the file and the legend of criterion 3, the provenance codes of the Record's Document with the file's text.
2. WHEN `reveal <file>` runs and the file is an Unchanged_File, THE Reveal_Command SHALL print the header and the whole file text as one `[PST]` code and its text, read from the file.
3. THE Reveal_Command SHALL print the Source_Legend as these four items, in this order: `[AI:<run>]` "changed while the agent was working, with the run it belongs to"; `[AI>HUM:<run>]` "agent text in a run that the Engine counts as edited outside the agent"; `[HUM]` "changed outside the agent; typing, pasting and other tools are not told apart"; `[PST]` "already in the file when recording started; origin not recorded".
4. THE Reveal_Command SHALL print only the provenance codes `[AI]`, `[AI>HUM]`, `[HUM]` and `[PST]` of the Engine's rendering, and SHALL omit the citation, quote, reference and override codes that the Engine's citation layer adds to source text (Decision 10).
5. WHERE the output is a terminal that reports 24-bit color through `COLORTERM` set to `truecolor` or `24bit` and `NO_COLOR` is not set, THE Reveal_Command SHALL print each code and its text in the Pane's colors from `product.md`: pane body background `#0F2766` with text `#E8ECF6`, `HUM` `#E8ECF6`, `PST` `#F5D98B`, `AI` `#A6D4F7`, `AI>HUM` `#D7C6F5`, header title `#FFFFFF`, legend `#BAC4E2`, and SHALL print the file's text as it is, without the Engine's escaping, so that the codes are told apart from the text by color (Decision 10).
6. WHERE the output is a terminal that reports 256 colors in `TERM` and not 24-bit color, THE Reveal_Command SHALL print the same colors mapped to the nearest entries of the 256-color palette, with the file's text unescaped.
7. WHERE the output is not a terminal, or `NO_COLOR` is set, or `TERM` is `dumb`, THE Reveal_Command SHALL print plain text with no escape sequence and with the Engine's escaping of `\`, `[` and `]` in the file's text, so that a code is never confused with text.
8. FOR ALL files, removing every ANSI escape sequence from the colored output SHALL give the plain-text output with the Engine's escaping removed from the file's text characters, that is, `unescape(plain)` equals `strip(colored)`, where `unescape` removes the escapes from text characters only and leaves codes, header and legend as they are.
9. IF the file has no Record and is not an Unchanged_File, THEN THE Reveal_Command SHALL print one line that says the file is not recorded and the reason (`not_tracked`, `over_limit`, `binary`, `ignored`, or `no_record`), and SHALL exit with status 1, where `no_record` means a tracked file that has neither a Record nor a Baseline_Entry, and a file with a Baseline_Entry whose digest differs is a Stale_Record under criterion 10.
10. IF the file is a Stale_Record, THEN THE Reveal_Command SHALL print as the first line the statement that the file changed after the last recorded event, with the number of Changed_Characters that are not yet recorded and the command `reveal --record`, SHALL print the Record as recorded after that line when a Record exists, SHALL print no code after that line when the file has only a Baseline_Entry, SHALL never present the output as current, and SHALL exit with status 0.
11. IF the Record is a Tampered_Record, THEN THE Reveal_Command SHALL print one line that names the file and the reason `tampered_record`, and SHALL exit with status 1.
12. THE Reveal_Command SHALL print nothing to standard error on success.

### Requirement 10: `reveal --summary [path]`

**User Story:** As a developer, I want a summary of what the agent wrote that no person has changed since, so that I know which parts nobody has read by editing them.

#### Acceptance Criteria

1. WHEN `reveal --summary` runs with no path, THE Reveal_Command SHALL summarize every Record and every Unchanged_File; WHEN it runs with a path to a file or a directory, THE Reveal_Command SHALL summarize the Records and Unchanged_Files under that path.
2. THE Reveal_Command SHALL print, per file and in total, the number of characters of each Origin (`AI`, `AI>HUM`, `HUM`, `PST`) and its share of the file's characters as a percentage with one decimal, the four shares summing to 100.0 within rounding, and SHALL count every character of an Unchanged_File as `PST`.
3. THE Reveal_Command SHALL print a list of the largest Untouched_Stretches in the summarized Records, each with its file, first and last line number, length in characters, Run_Label and Window_Run, ordered by length descending, then path ascending, then offset ascending.
4. THE Reveal_Command SHALL print at most 10 Untouched_Stretches, or the number given by `--top <n>` where `<n>` is a positive integer.
5. THE Reveal_Command SHALL derive the Untouched_Stretches only from the `AI` Spans of the Records, and SHALL report in one line the number of characters in `AI>HUM` Spans that it leaves out of the list, so that no agent text is dropped without being counted.
6. THE Reveal_Command SHALL print a table that groups the `AI` and `AI>HUM` characters by Window_Run, with the Run_Label, the time the window opened, the number of files and Runs, and the characters of each of the two Origins, ordered by opening time ascending, so that a person can see how much agent text each task or turn left.
7. WHEN a summarized file is a Stale_Record, THE Reveal_Command SHALL mark that file in the output as stale.
8. THE Reveal_Command SHALL give the same output for the same Records, Baseline_File, files and arguments on every run.
9. THE Reveal_Command SHALL print the Source_Legend's statement that `[HUM]` does not tell typing from pasting from other tools, once, in the summary.
10. IF no Record and no Baseline_Entry exists, THEN THE Reveal_Command SHALL print one line that says nothing is recorded and name the setup command, and SHALL exit with status 1.

### Requirement 11: `reveal --check`

**User Story:** As a maintainer, I want a command that fails when a record is damaged and reports a record that is behind its file, so that CI can tell a trustworthy record from a damaged one.

#### Acceptance Criteria

1. WHEN `reveal --check` runs, THE Reveal_Command SHALL, for every Tracked_File, read the file, read its Record or Baseline_Entry, parse the Record with `parseRecord`, and compare the Recorded_Text, or the digest of the Baseline_Entry, with the file text.
2. WHEN every Tracked_File has either a Record whose Recorded_Text equals the file text, or a Baseline_Entry whose digest equals the digest of the file text, THE Reveal_Command SHALL print one line that gives the number of files checked and SHALL exit with status 0.
3. IF a Record cannot be parsed or does not satisfy the Engine's own checks, THEN THE Reveal_Command SHALL print one line that names the Record and the reason `tampered_record`, and SHALL exit with status 1.
4. IF a Record exists for a path that is not a Tracked_File, THEN THE Reveal_Command SHALL print one line that names the Record and the reason `orphan_record`, and SHALL exit with status 1.
5. IF a Baseline_Entry exists for a path that is not a Tracked_File, or a path has both a Record and a Baseline_Entry, THEN THE Reveal_Command SHALL print one line that names the path and the reason `orphan_baseline`, and SHALL exit with status 1.
6. IF a Tracked_File has a Record whose Recorded_Text differs from the file text, or a Baseline_Entry whose digest differs from the digest of the file text, THEN THE Reveal_Command SHALL print one line that names the file and the reason `stale`, and SHALL report it without changing the exit status.
7. IF a Tracked_File has neither a Record nor a Baseline_Entry, THEN THE Reveal_Command SHALL print one line that names the file and the reason `no_record`, and SHALL report it without changing the exit status, because a file that appeared after the last event is not yet recorded (Decision 2).
8. WHERE `reveal --check --strict` is run, THE Reveal_Command SHALL exit with status 1 when any `stale` or `no_record` line is printed, in addition to the exit statuses of criteria 3 to 5.
9. THE Reveal_Command SHALL print the reasons in path order, SHALL print every failure and every report and not only the first, and SHALL label each line as `fail` or `report`.
10. THE Reveal_Command SHALL print the exact command that catches the record up (`reveal --record`) on the last line of a run that printed a `stale` or `no_record` line.
11. WHEN `reveal --record` runs, THE Reveal_Command SHALL run the Recorder with the Hook_Event `manual` (Requirement 3, criteria 9 and 10).
12. THE Reveal_Command SHALL perform the check without a network request and without writing any file.

### Requirement 12: The MCP tools

**User Story:** As a developer, I want to ask Kiro which parts of a file I have not touched since it wrote them and get the answer from the record as data, so that the answer does not depend on the model's memory.

#### Acceptance Criteria

1. THE Bundle SHALL start an MCP server over standard input and standard output when it runs as `provenance mcp`, using `@modelcontextprotocol/sdk` bundled into the Bundle.
2. THE Provenance_Tools SHALL be `reveal_file`, `provenance_summary`, `untouched_agent_text`, `check_records` and `setup_provenance`, each with a one-sentence description that says when to call it.
3. THE Provenance_Tools SHALL return, for each of `reveal_file`, `provenance_summary`, `untouched_agent_text` and `check_records`, structured content that matches the shape documented in criteria 4 to 7, together with a short text summary of one to five lines, and SHALL declare each shape as the tool's `outputSchema`.
4. WHEN the tool `reveal_file` is called with a path, THE Provenance_Tools SHALL return the structured content `{ file, status, unrecordedCharacters, spans, legend }`, where `status` is `current`, `unchanged_baseline`, `stale` or `unrecorded`, `unrecordedCharacters` is the number of Changed_Characters or `0`, `spans` is an array of Structured_Span in file order that covers every character of the file as of the last recorded event, and `legend` is the four items of the Source_Legend.
5. WHEN the tool `untouched_agent_text` is called with a path and an optional `top`, THE Provenance_Tools SHALL return the structured content `{ path, stretches, countsByOrigin, omittedAiHumCharacters, stale, notice }`, where `stretches` is an array of Structured_Span of origin `AI` in the order of Requirement 10, criterion 3, `countsByOrigin` has the keys `AI`, `AI>HUM`, `HUM` and `PST`, and `notice` is the statement that `[HUM]` does not tell typing from pasting.
6. WHEN the tool `provenance_summary` is called, THE Provenance_Tools SHALL return the structured content `{ files, total, windows, stretches, omittedAiHumCharacters, notice }`, where each of `files` and `total` holds the counts and shares by Origin and a `stale` flag, `windows` is an array `{ windowRun, taskTitle, openedAt, files, runs, aiCharacters, aiHumCharacters }`, and `stretches` is an array of Structured_Span with a `file` key.
7. WHEN the tool `check_records` is called with an optional `strict` flag, THE Provenance_Tools SHALL return the structured content `{ ok, filesChecked, failures, reports }`, where `failures` and `reports` are arrays `{ path, reason }` with the reasons of Requirement 11, and SHALL mark the result as an error when `reveal --check` or `reveal --check --strict` with the same flag would exit with a status other than 0.
8. THE Provenance_Tools SHALL return line and column positions in the structured content as the Structured_Span defines them, and SHALL return no escaped text and no ANSI sequence.
9. WHEN the tool `setup_provenance` is called, THE Provenance_Tools SHALL perform the installation of Requirement 13, criterion 3, and SHALL return `{ written, kept }`, the lists of files it wrote and files it kept.
10. THE Provenance_Tools other than `setup_provenance` SHALL read only the Record_Directory, the Kiro_Ignore_File and the files they describe, and SHALL write no file.
11. THE Provenance_Tools SHALL answer from the Records and the Baseline_File and SHALL not call any model.
12. THE Provenance_Tools SHALL take the Workspace_Root from the argument `workspace` when given, else from the current directory of the MCP process, and SHALL walk up from that directory to the nearest directory that holds a Record_Directory.
13. IF no Record_Directory is found, THEN THE Provenance_Tools SHALL return an error result that says provenance is not set up in this workspace and names the tool `setup_provenance`.
14. THE Provenance_Tools SHALL mark `reveal_file`, `provenance_summary`, `untouched_agent_text` and `check_records` as read-only tools in their MCP annotations, and SHALL leave `setup_provenance` without that mark.

### Requirement 13: The Power that installs it

**User Story:** As a developer, I want to import one Power and say "set up provenance", so that nothing else needs installing.

#### Acceptance Criteria

1. THE Provenance_Power SHALL live in `powers/provenance` and SHALL contain `plugin.json` with `$schema` `https://agent-plugins.org/schemas/1.0.0/plugin.schema.json`, `mcp.json`, `server/provenance.mjs`, `skills/setup-provenance/SKILL.md`, `skills/reveal-codes-for-source/SKILL.md` and `README.md`.
2. THE `plugin.json` SHALL give keywords that include `provenance`, `who wrote`, `agent wrote`, `untouched`, `reveal codes`, `ai-written` and `hooks`, and THE `mcp.json` SHALL start `node ${PLUGIN_ROOT}/server/provenance.mjs mcp` with no environment variable.
3. THE Setup_Skill SHALL instruct the agent to call `setup_provenance`, and WHEN that tool runs, THE Provenance_Tools SHALL, in this order: create the Record_Directory; copy the Bundle to `<Record_Directory>/provenance.mjs`; write the shell wrapper `<Record_Directory>/reveal` (Decision 3); write `<Record_Directory>/.gitignore` that lists `state.json`, `errors.log` and the lock file; write the Kiro_Ignore_File with its comment lines when it does not exist; write the Hook_File when it does not exist; run the baseline, which writes the Baseline_File and no Record; and return the list of every file written.
4. WHEN `setup_provenance` finds a Hook_File, a Kiro_Ignore_File, a Baseline_File or a Record_Directory that already exists, THE Provenance_Tools SHALL leave it unchanged and SHALL name it in the result as kept.
5. THE Setup_Skill SHALL tell the agent to say, after setup, which files were written, that a Power cannot carry hooks and so the Hook_File was written into the workspace, that text already in the files is recorded as `[PST]`, that a file gets a Record at its first change, that the record starts on the day of setup, that Windows is not supported, and the three Reveal_Command forms with the command line that runs them.
6. THE Setup_Skill SHALL tell the agent to ask the person before it calls `setup_provenance`, and SHALL not mark the tool as auto-approved.
7. THE Setup_Skill SHALL tell the agent to offer a git pre-commit hook that runs `reveal --record`, with the text of the hook, and SHALL not write that hook unless the person says yes.
8. THE second skill SHALL tell the agent how to answer questions such as "which parts of this file have I not touched since you wrote them?" by calling `untouched_agent_text`, SHALL tell the agent to quote the notice that `[HUM]` does not tell typing from pasting, and SHALL tell the agent to say that it answers from the record and not from memory.
9. THE `README.md` of the Provenance_Power SHALL state the import steps, the Node 20 requirement, that Windows is not supported, the legend, what the record cannot know, that a file has no Record until it first changes, and that the Record_Directory is committed (Decision 1).
10. THE Bundle SHALL contain the Recorder, the Reveal_Command and the MCP server in one file, SHALL run with `node` 20 or newer with no `node_modules` beside it, and SHALL be built by `esbuild` the way `scripts/build-power.mjs` builds `powers/citation-check/server/courtlistener-mcp.mjs`.
11. THE command `pnpm power:build` SHALL build both Powers deterministically, and WHEN it runs on a clean checkout, THE working tree SHALL stay clean.
12. THE repository SHALL contain a test that fails when `powers/provenance/server/provenance.mjs` differs from a fresh build, as the test for the citation-check Power does.
13. THE Provenance_Power SHALL declare no hook component, because the Agent Plugins layout that Kiro documents for a Power has none (Decision 5).

### Requirement 14: This repository uses it

**User Story:** As the author, I want this repository to be recorded by the feature while it is built, so that the README can show a real excerpt and the record is a true test.

#### Acceptance Criteria

1. THE repository SHALL contain, from the end of the install task named in Decision 14, a Hook_File, a Record_Directory, a Kiro_Ignore_File, a Baseline_File and the git pre-commit hook of criterion 6.
2. THE Baseline_File of this repository SHALL list every tracked file that exists at that time with its digest, and THE documentation SHALL say that the record starts on the day it was installed, that earlier text is `[PST]`, and that a file gets a Record at its first change.
3. WHERE the Provenance_Power does not exist at the time of installation, THE installation of this repository SHALL be made by the commands that the Setup_Skill later automates, and SHALL be repeated by the Setup_Skill at the final checkpoint with no change to any Record or Baseline_Entry.
4. THE final checkpoint SHALL run `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:pbt`, the clean-checkout `pnpm --filter @reveal-codes/web build`, `pnpm kiro:check`, `pnpm power:build` leaving the tree clean, `reveal --check --strict` and `reveal --summary` on this repository.
5. THE README SHALL show one real excerpt of `reveal <file>` taken from this repository's Records, with the file name and the date.
6. THE install task SHALL write a git pre-commit hook at `.git/hooks/pre-commit` in this repository only, that runs the Recorder with the Hook_Event `manual` and then stages the Record_Directory, because Kiro commits in the middle of a window in chat mode; WHERE a pre-commit hook already exists, THE install task SHALL append to it and leave its content unchanged.
7. THE pre-commit hook SHALL finish with status 0 when the Recorder fails, SHALL write nothing to standard output beyond what git itself prints, and SHALL be described in `docs/KIRO_USAGE.md` and the README as a hook that is not versioned by git, with the line that recreates it.

### Requirement 15: Nothing existing is disturbed

**User Story:** As a maintainer, I want the feature to leave the product and its tests alone, so that the filing format and the web app stay as they are.

#### Acceptance Criteria

1. THE spec SHALL change no file under `apps/web`, `packages/verifier`, `packages/export`, `packages/engine/src`, `crew/sentinel` or `data`.
2. THE spec SHALL change `packages/engine/src/testing` and `packages/engine/test` in no file.
3. THE exported filing, the Provenance Appendix and their tests SHALL produce the same bytes as before this spec.
4. THE spec SHALL change the root `package.json` only to add the script `reveal`.
5. THE spec SHALL change `pnpm-workspace.yaml` only if the existing `packages/*` pattern does not already include `packages/provenance`.
6. THE spec SHALL add to `vitest.config.ts` one project named `provenance` and SHALL change no other project.
7. THE spec SHALL change `scripts/build-power.mjs` so that it builds both Powers and SHALL leave the bytes of `powers/citation-check` unchanged.
8. IF the order measurement of Requirement 8, criterion 5 requires a change to `scripts/commit-task.sh`, THEN THE change SHALL add one line that calls the Recorder before `git add -A`, SHALL leave the commit message rules unchanged, and SHALL be covered by the existing tests of that script.
9. THE spec SHALL change no existing file under `.kiro/hooks`.

### Requirement 16: Properties and example tests

**User Story:** As a maintainer, I want properties and recorded examples that pin the behavior, so that the record can be trusted.

#### Acceptance Criteria

1. THE Provenance_Package SHALL give each invariant below exactly one `fc.assert(fc.property(...))` in a file named `<module>.properties.test.ts`, with the comment `// Property N` above it and `_Requirements: x.y_` in the `describe` title, using `fast-check` and `numRuns` from the shared helper (at least 200 locally, 500 in CI).
2. Property 1 (the record or the baseline is the file): FOR ALL sequences of Agent_Changes and Outside_Changes applied to a file, including empty files, deletion of all text, and changes at the start and the end, THE Recorded_Text of the file's Record SHALL equal the file text after every event, or, WHEN the file has no Record, THE file SHALL have a Baseline_Entry whose digest equals the digest of the file text.
3. Property 2 (attribution): FOR ALL such sequences, text inserted at an event that closes an Agent_Window SHALL have origin `AI` and a Run whose Window_Run is the name of that window; text inserted at any other event SHALL never have origin `AI`; and text that no change touched SHALL keep its origin and Run.
4. Property 3 (changed agent text): FOR ALL Records that hold `AI` text and all Outside_Changes to that text, THE Recorder's result SHALL equal the result of applying the same operations to the same Document with the Engine's `apply` directly, so that every `AI>HUM` Span arises only from the Engine's relabelling, and the characters of the file are unchanged (Decision 8).
5. Property 4 (nothing happens twice): FOR ALL Record_Directories and all events, running the same event again with no file change SHALL leave every Record, the Baseline_File and the other files that are not `state.json` or `errors.log` byte for byte the same.
6. THE example tests SHALL cover, with the payloads captured from the real IDE and the real CLI (the captures happen first and are committed as fixtures that hold only field names, types and the title fields), each Hook_Event for each surface.
7. THE example tests SHALL cover a rename of an Unchanged_File, a rename of a file that has a Record, a deletion of each, a binary file, a file over the Size_Limit, a rename plus an edit, a git-ignored file, a file listed in the Kiro_Ignore_File, and a file that appears inside an Agent_Window.
8. THE example tests SHALL cover a First_Change whose Baseline_Text is found at `HEAD`, one found in an earlier commit, and one not found (the whole file text inserted with the origin of the event, and the reason `baseline_text_unavailable` in the Fault_Log), each in a temporary git repository.
9. THE example tests SHALL cover a hook run on a corrupt Record_Directory (a truncated Record, an unparseable `state.json`, an unparseable Baseline_File, an unwritable directory), in which the Recorder writes to the Fault_Log, prints nothing and exits with status 0.
10. THE example tests SHALL cover `reveal --check` failing on a tampered Record, an orphan Record and an orphan baseline, reporting without failing on a stale file and a `no_record` file, and failing on both with `--strict`, with the exit status and the reason lines.
11. THE example tests SHALL run the Provenance_Tools over standard input and standard output from a copy of `powers/provenance` placed outside the repository with no `node_modules`, SHALL call each tool, and SHALL check that each result matches the shape of Requirement 12.
12. THE example tests SHALL cover `reveal <file>` in 24-bit color, 256-color and plain modes, and criterion 8 of Requirement 9 (`unescape(plain)` equals `strip(colored)`), on a file that contains `[`, `]` and `\`, and the Provenance_Package SHALL give that relation one property of its own.
13. THE example tests SHALL cover the `manual` event with and without an open window, and the two checks of Requirement 7, criteria 7 and 8 as measured values recorded in `BUILD_LOG.md`.
14. THE arbitraries for file text, line-based edit sequences, window sequences and Record_Directories SHALL live in `packages/provenance/src/testing/arbitraries.ts` and SHALL cover text with surrogate pairs, carriage returns, a byte order mark, empty text and text that contains `[`, `]` and `\`.
15. THE tests SHALL touch no network and SHALL use no mock of the Engine.
16. THE tests SHALL contain no `try/catch` that hides an error, no test that only imports a module, and no snapshot test of the Engine.
17. THE design SHALL verify, with an example test over the Engine, that one `replace` of a Hunk yields one Run per Hunk, because the Engine relabels per Run and its relabelling depends on the insertion extent of each Run (Decision 8), and SHALL list in `BUILD_LOG.md` any property that the design had to change and why.

### Requirement 17: Documentation and vocabulary

**User Story:** As a reader, I want the documentation to say plainly what the record knows and what it does not, so that nobody reads more into it than it holds.

#### Acceptance Criteria

1. THE `README.md` SHALL contain a section "Reveal Codes for your own repository" that shows the three Reveal_Command forms, one real excerpt, the Source_Legend, the statement that the record starts on the day it was installed and that earlier text is `[PST]`, and the statement that Windows is not supported.
2. THE `README.md` section SHALL state that `[HUM]` does not tell typing from pasting from other tools, that `[AI]` means changed while the agent was working and includes the output of commands the agent ran, that a change a person saves while the agent is working is attributed to the agent, and that the record is not proof that no AI wrote a passage.
3. THE `README.md` section SHALL state that a file has no Record until its first change, and that WHEN the text the file had at the baseline cannot be found in git at that change, the whole file is recorded with the origin of the event.
4. THE `docs/KIRO_USAGE.md` SHALL gain rows for the Hook_File, the git pre-commit hook of this repository, the Provenance_Power, its MCP server and skills, and this spec, each with the files it names, so that `pnpm kiro:check` passes.
5. THE `BUILD_LOG.md` SHALL gain a dated entry that states what was built, what Kiro got wrong, what fixed it, the measured times of Requirement 7, the measured hook order and the measured timeout field of Requirement 18.
6. THE `.kiro/steering/product.md` SHALL gain a section "Source files" that gives the Source_Legend and states that the codes `HUM`, `PST`, `AI` and `AI>HUM` keep their spelling and gain these meanings only for the Records of the Provenance_Package, and SHALL change no other part of the Codes list.
7. THE `.kiro/steering/structure.md` SHALL list `packages/provenance`, `powers/provenance`, `.kiro/provenance/`, `.kiroignore` and the new `scripts` entries.
8. THE `.kiro/steering/tech.md` SHALL list the new package, the new script and the new Vitest project, and SHALL state that the Provenance_Package may depend on a text-difference library while the Engine may not.
9. THE documentation SHALL state in plain words that no prompt text is stored and that nothing leaves the machine.

### Requirement 18: Process gates and measurements

**User Story:** As the author, I want the payloads and the hook behavior measured before the design relies on them, and the spec committed before any task, so that nothing is built on a guess.

#### Acceptance Criteria

1. THE spec SHALL be committed, with `requirements.md`, `design.md`, `tasks.md` and `.config.kiro`, before any task starts.
2. THE Probe SHALL record, for each hook payload on standard input, only the field names, the field types and the title fields of the payload, and SHALL record no prompt text and no other field value.
3. THE Probe SHALL read standard input with a timeout of at most 1.5 seconds, because the standard input of some IDE builds never closes.
4. THE Probe SHALL be run in the IDE and in the CLI for each of the events `promptSubmit`, `agentStop`, `preTask` and `postTask`, and SHALL record the order in which the Probe and `commit-on-task` run at `postTask` on each surface.
5. THE Probe SHALL determine which of `timeout` (seconds, documented) and `timeout_ms` (milliseconds, used by the existing hooks of this repository) the IDE honours, by two probe hooks that each sleep longer than their stated timeout and show which one the IDE ends.
6. IF the measurement shows that the timeout fields of the existing hooks of this repository are not in effect, THEN THE spec SHALL report that to the user and SHALL change no existing hook.
7. THE design SHALL NOT be finalized before the user has approved the field list that the Probe captured, and the field list SHALL be shown to the user before the design is written.
8. THE design SHALL state which Probe capture precedes the design phase and which results the install task repeats and commits as fixtures.
9. THE task list SHALL run in this order: task 1 captures the Probe payloads and measures the hook order and the timeout field; then the pure core and the Recorder; then the installation in this repository, including the Hook_File, the pre-commit hook and the Baseline_File; then the viewer, the MCP server, the Power, the documentation and the final checkpoint.

## Decisions

These record the user's answers to the 17 questions that were open on 2026-11-18. The user accepted every recommendation except where a decision below says it changed. The numbers are the numbers of the questions.

1. **Record directory.** Committed, at `.kiro/provenance/`, with `state.json`, `errors.log` and the lock file ignored by a `.gitignore` inside it. Changed: no Record is written for a file that has not changed since the baseline. One small committed Baseline_File holds the path and SHA-256 digest of each such file. A Record is created at the file's First_Change from the baseline text as `[PST]` with the difference applied. A file that has a Baseline_Entry and no Record, with an unchanged digest, is shown as `[PST]` and is not a fault in `--check`. A conflict in a Record is resolved by deleting the Record and running `reveal --record`; the file then has neither a Record nor a Baseline_Entry, so it is recorded whole with the origin of the event, and that file's history is lost. Requirements 2, 5, 6, 9, 10, 11 and 13 follow.
   - **How the starting text of a Record is obtained (the design must resolve this).** Only a digest is stored, so the Baseline_Text must come from elsewhere at the First_Change. Requirement 5, criterion 5, proposes the least bad option: the blob of the path at `HEAD` when its digest equals the Baseline_Entry's digest; then the blob in each of the 20 most recent commits that changed the path with the same test; then nothing. When nothing is found (no git, a file that was changed and committed more than 20 commits ago, a file that had uncommitted changes at the baseline, or a line-ending conversion that alters the bytes), the Recorder inserts the whole current text with the origin of the event and writes `baseline_text_unavailable` to the Fault_Log. The consequence, stated plainly: for such a file the Record says the whole file is `[AI]` (if the First_Change was found at an event that closes a window) or `[HUM]` (otherwise), including the lines that were there at the baseline and that nobody changed. It over-attributes. A file changed between the last event and the next event has its pre-change text only if the text is in git or cached. The Recorder keeps no cache of file text in this spec. The design must decide whether that is acceptable. The alternative that the design may weigh is an ignored cache of the baseline text under the Record_Directory, which fixes the problem for non-git workspaces at the cost of a second copy of every tracked file's text on disk.
   - **What in the design depends on a record existing for every file.** Plainly: anything that reads "the Record of a tracked file" must now also handle "no Record, a Baseline_Entry". That covers: Property 1 (now "Record text equals file text, or Baseline_Entry digest equals file digest"); the check and its reasons (`no_record` used to fail and now reports; `orphan_baseline` is new); `reveal <file>` (an Unchanged_File has no Record to render); the summary totals (an Unchanged_File counts as `PST` from the file text, not from a Record); the MCP tools that return spans (an Unchanged_File returns one `PST` span); rename handling (a rename of an Unchanged_File changes only the Baseline_Entry's path); deletion and exclusion handling (the Baseline_Entry is removed with the file); the cache in `state.json` (a digest compared against the Baseline_Entry as well as against the Record); the size accounting of the Record store; the arbitraries (a Record_Directory may hold a Baseline_File and few Records); the Baseline command (it now writes no Record); the setup tool (it writes no Record); Property 4 (the Baseline_File must also stay byte for byte the same); the README excerpt (it needs a file that has changed); and the recovery from a deleted Record described above. Anything the design wrote that says "every tracked file has a Record" is wrong under this decision.
2. **Stale records.** Kept: named reasons and `reveal --record`. Additions. (1) `reveal <file>` on a stale file says so at the top with the number of characters not yet recorded, and never presents the file as current (Requirement 9, criterion 10). (2) For this repository a git pre-commit hook runs the Recorder catch-up with the Hook_Event `manual`, because Kiro commits in the middle of a window in chat mode; the Setup_Skill only offers that hook elsewhere (Requirement 14, criterion 6; Requirement 13, criterion 7). (3) `--check` fails on a Record that does not parse, an orphan Record, an orphan baseline and a tampered Record; it reports `stale` and `no_record` without failing; `--strict` also fails on both (Requirement 11).
   - **One interpretation to confirm.** The answer said the catch-up is a `manual` event that records an Outside_Change. If a window is open at the commit, that would label the agent's text so far as `[HUM]`, which is the opposite of what happened. Requirement 3, criteria 9 and 10, therefore make `manual` record an Outside_Change only when no window is open, and an Agent_Change of the innermost open window, leaving the window open, when one is. If you want the literal rule, delete criterion 10 and the reader's legend wording stays unchanged. A window that was never closed (Decision 7) would make a later `reveal --record` label a person's edits `[AI]`; the `window_left_open` rule limits that to the time until the next prompt.
   - **A classification I chose.** `no_record` (a tracked file with neither a Record nor a Baseline_Entry, that is, a file that appeared after the last event) is reported, not failed, like `stale`, because it has the same cause: the record is behind the file.
3. **Command.** As recommended: the Bundle is the command, copied to `.kiro/provenance/provenance.mjs`, with an executable wrapper `.kiro/provenance/reveal`; `pnpm reveal` in this repository. Windows is not supported, and the README says so (Requirements 13 and 17).
4. **Payload capture.** Yes, with the Probe, which records only field names, field types and title fields, and reads standard input with a short timeout because the standard input of some IDE builds never closes. The captured field list is shown to the user before the design is written, and the design is not finalized before the user approves it (Requirement 18, criteria 2, 3 and 7). Requirement 3, criteria 13 to 16, and Requirement 16, criteria 6 and 11, depend on it.
   - **Sequencing the design must settle.** The Probe has to run before the design is final, and the task list begins with a capture task. Requirement 18, criterion 8, has the design say which part of the capture is done during the design phase and which part task 1 repeats and commits as fixtures.
5. **Power and hooks.** As recommended: a Power cannot carry hooks, so the skill writes `.kiro/hooks/provenance.json` and says so. The Bundle is copied into the workspace. The tools accept a `workspace` argument because it is unverified that Kiro starts a Power's MCP server in the workspace.
6. **Changes during a window.** As recommended: the four events are binding; tool-level hooks are left out; the README states that a change a person saves while the agent is working is attributed to the agent.
7. **A window that never closes.** As recommended: the next Prompt Submit records what it finds as an Outside_Change, writes `window_left_open`, and opens a new window.
8. **Run granularity.** Changed from the recommendation to option (b): one Run per Hunk. Each Run carries its window and task title: the Run name is the Window_Run plus the Hunk number, and the Run_Label stays the task title. A window has many Runs. A person who reworks one function turns that Hunk into `[AI>HUM]` and not every line the agent wrote in the window. Requirements 3, 4, 10 and 16 changed; the summary also groups by Window_Run and task title.
   - **What stays as it was.** The Engine still relabels a whole Run; that Run is now one Hunk. Property 3 stays as "the Recorder's result equals the Engine's own result for the same operations" (Requirement 16, criterion 4).
   - **For the design to verify.** The Engine's relabelling depends on the insertion extent of each Run. The design must show, with an example test over the Engine (Requirement 16, criterion 17), that a `replace` of a Hunk yields one Run per Hunk and that an edit to one Hunk does not count against the extent of a neighbouring Run. If it does not, the design must say how the Recorder splits the operation.
9. **Meaning of the codes.** As recommended: `HUM` and `AI` are used as written, with the broader meanings in `product.md` under "Source files", and the legend in Requirement 9, criterion 3.
10. **View.** Provenance codes only. Changed: in the coloured terminal view the Engine's escaping is not shown. The file's text is printed as it is, and the codes are told apart from the text by the Pane's colors, so a file that contains the text `[AI]` reads the same as a code only by color. In plain output (no color, or piped) the escaped form is used so that the output is unambiguous. Requirement 9, criterion 8, restates the old byte-for-byte rule as `unescape(plain)` equals `strip(colored)`, and Requirement 16, criterion 12, adds a property and an example for it. The MCP tools return structured spans (line and column ranges, origin, run and task title) and no escaped text; Requirement 12 gives the shapes.
11. **Size limit.** As recommended: 200,000 UTF-16 code units, defined once in the new package. A file that grows over the limit loses its Record or Baseline_Entry. The Hunk count has no cap.
12. **Renames and deletions.** As recommended, with the baseline added: a rename is recognised only when one gone file and one new file have exactly the same non-empty text (or digest, for an Unchanged_File) at the same event. A rename of an Unchanged_File changes only the path of its Baseline_Entry. A deleted file loses its Record or Baseline_Entry (Requirement 5, criteria 10 to 13).
13. **Hook order.** Measured, not assumed (Requirement 18, criterion 4). If the Recorder does not run first, one line in `scripts/commit-task.sh` that runs the Recorder first is allowed (Requirement 8, criterion 6; Requirement 15, criterion 8).
14. **Task order.** Changed. Task 1 captures the Probe payloads and measures the hook order and the timeout field. Then the core and the Recorder. Then the installation in this repository, including the pre-commit hook and the Baseline_File. Then the viewer, the MCP server, the Power, the documentation and the final checkpoint (Requirement 18, criterion 9). The spec is committed before any task (Requirement 18, criterion 1). The tasks before the installation are `[PST]` or unrecorded, and the documentation says so.
15. **Time budgets.** Accepted: 5 seconds with no cache, a 20-second internal deadline and a hook timeout of 30 seconds. Added: a `promptSubmit` event with no change has a limit of 0.5 seconds on this repository, because it sits in front of every prompt; other events with no change keep 1.5 seconds. The design reports the typical `promptSubmit` time, which the user expects to be well under 0.5 seconds (Requirement 7, criteria 7 to 9). The measured cold scan of 0.27 seconds on this repository supports the limit, but it was taken without the `git ls-files --ignored` call that Requirement 2, criterion 3, adds; the design must measure again.
16. **Excluded files.** The list in Requirement 2, plus every file that git ignores and every file that `.kiroignore` lists. The Kiro_Ignore_File replaces `<Record_Directory>/ignore`, which is dropped, and setup writes `.kiroignore` instead. When the Workspace_Root is not a git tree, no git ignore rule applies. The design must check whether Kiro itself already reads a file named `.kiroignore`, and if it does, that the pattern syntax of Requirement 2, criterion 9, does not conflict with it.
    - **Hook timeout field.** Added in Requirement 7, criterion 11, and Requirement 18, criteria 5 and 6: the Probe finds which of `timeout` (seconds, documented) and `timeout_ms` (used by this repository's existing hooks) the IDE honours. If the existing hooks' timeouts are not in effect, the spec reports it and changes no existing hook. The new Hook_File uses the honoured field and, if the measurement does not determine it, the documented `timeout`.
17. **Arbitraries.** As recommended: `packages/provenance/src/testing/arbitraries.ts`, with a line in `BUILD_LOG.md` that explains the exception to `tech.md`.
