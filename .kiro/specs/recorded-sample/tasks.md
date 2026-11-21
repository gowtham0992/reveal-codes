# Implementation Plan: recorded-sample

## Overview

Work in this order: file protection and delivery, then the install path, then the toolbar action, then tests that move, then docs, then the full checks once. `packages/engine/src`, the saved-draft format and the Verifier are not edited. The recorded file is never edited or reformatted.

Conventions for every task:

- Run only the web test project: `pnpm exec vitest run --project web <test files>`. No other project and no lint, typecheck or full test until the last task.
- Functions stay under 40 lines, modules under 300; no `any`; named exports only; no `try`/`catch` that swallows an error.
- A task that breaks an existing test updates that test in the same task.
- Each completion note records anything Kiro got wrong and the fix, for the BUILD_LOG entry in task 5.1.
- The spec commit (`spec(recorded-sample): requirements, design and tasks`) precedes task 1.1. No task pushes to a remote.

## Tasks

- [x] 1. Protect and deliver the recorded file
  - [x] 1.1 Keep the file out of Prettier and copy it to `public`
    - Add `packages/engine/fixtures/demo-motion.recorded.json` to `.prettierignore` and `apps/web/public/demo-motion.recorded.json` to `.gitignore`. Add the pair to `DEFAULT_PAIRS` in `apps/web/scripts/copy-demo.ts`. Add one line to `packages/engine/fixtures/README.md` (recorded in this editor on the hosted site on 2026-11-21, sha256, "never edited").
    - Write `apps/web/test/recorded-sample.test.ts` with the digest pin, the load through `deserialise`, the content checks of Requirement 2, no Declaration, and a `copy-demo` byte-for-byte case. Add a check that a Demo_Mode verify of the file's full citations resolves from `packages/verifier/fixtures` with no gap; if any citation has no fixture, stop and report before building further.
    - Run `pnpm exec vitest run --project web apps/web/test/recorded-sample.test.ts apps/web/test/avianca.test.tsx`; update the `avianca.test.tsx` copy-demo case for the third file.
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 2.1, 2.2, 2.3, 2.4, 4.2, 6.3_

- [ ] 2. Install path
  - [x] 2.1 Add `recordedSample` to the API client
    - Add `recordedSample()` to `ApiClient` and `createApiClient` in `apps/web/src/client/api.ts`, and to `lazyApi` in `apps/web/src/services.ts`. Add one line to each test fake that lists every member (`avianca.test.tsx`, `samples-declaration.test.tsx`, `text-safety.test.tsx`, `support/check-date-fixtures.ts`, `open-empty-page.test.tsx`, and `document-actions.test.tsx`).
    - Run `pnpm exec vitest run --project web apps/web/test/avianca.test.tsx apps/web/test/text-safety.test.tsx apps/web/test/open-empty-page.test.tsx`.
    - _Requirements: 3.1_
  - [-] 2.2 Share the restore step
    - In `apps/web/src/components/use-autosave.ts` extract `installRestored(store, restored, holder?)` from `loadAutosave` and call it there. Behaviour does not change.
    - Run `pnpm exec vitest run --project web apps/web/test/persist.test.ts apps/web/test/persist-resolved.properties.test.ts`, plus the autosave tests that match `autosave` in `apps/web/test`.
    - _Requirements: 3.6, 3.7_
  - [~] 2.3 Property 1: install then save is the identity
    - Write `apps/web/test/recorded-sample.properties.test.ts` with one `fc.assert(fc.property(...))` under `// Property 1`, `_Requirements: 8.1_` in the describe title, reusing the arbitraries of `persist-resolved.properties.test.ts` (export the case arbitrary from `support/` only if it is not already shared). Add the comment to the list in `apps/web/test/static/inventory.test.ts`.
    - Run `pnpm exec vitest run --project web apps/web/test/recorded-sample.properties.test.ts apps/web/test/static/inventory.test.ts`.
    - _Requirements: 8.1_

- [ ] 3. Load demo motion installs the recording
  - [~] 3.1 Wire `loadSample` for key `demo`
    - Add `RECORDED_SAMPLE_LOADED` to `apps/web/src/notices.ts`. In `use-document-actions.tsx` add `holder` to `Deps`, make the `demo` path fetch `recordedSample()`, `deserialise`, `installRestored`, then dispatch the notice; any failure dispatches `DEMO_FAILED`. Pass `a.holder` in `app-shell.tsx`. Keep the Confirm_Dialog copy as it is. Check the empty-page link's click handler: a click must call the same action as the Toolbar button (preventDefault, same confirm, installs the recording); keep its `href` to `demo-motion.txt` only as the no-script fallback. Change the handler if it does not.
    - Run `pnpm exec vitest run --project web apps/web/test/recorded-sample.test.ts`.
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.6, 3.8_
  - [~] 3.2 Component tests for the load
    - Write `apps/web/test/recorded-sample-load.test.tsx`: load on an empty draft; the confirm and the cancel; the notice text; the Issues_Region shows the Checked date; no `/api/*` request on load in Demo_Mode and in Live_Mode (a fetch fake that records every URL); failure notice and unchanged draft; Verify afterwards in Demo_Mode resolves from the fixtures and replaces the Check_Date; Export asks the Declaration question; clicking the empty-page link installs the recorded draft, same as the Toolbar button.
    - Run `pnpm exec vitest run --project web apps/web/test/recorded-sample-load.test.tsx`.
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.8, 4.1, 4.2, 4.3, 5.1, 5.2, 7.1_

- [ ] 4. Move the existing demo tests
  - [~] 4.1 Point the Load demo tests at the recording
    - In `document-actions.test.tsx` (lines 164 to 270) and `samples-declaration.test.tsx` (line 132) answer `recordedSample` with the recorded file's text and update the expectations (notice, Run_Log now filled, Declaration still asked). Leave `check-page.test.tsx`, `check-rows.test.ts` and the support files on Demo_Text.
    - Run `pnpm exec vitest run --project web apps/web/test/document-actions.test.tsx apps/web/test/samples-declaration.test.tsx apps/web/test/check-page.test.tsx apps/web/test/check-rows.test.ts`.
    - _Requirements: 3.1, 5.2, 6.2_

- [ ] 5. Documentation and release checklist
  - [~] 5.1 Docs
    - README: one line in "What it does" and one in "Demo path" using "recorded in this editor on the hosted site on 2026-11-21"; add "No prompt text is stored, and nothing leaves the machine." to the provenance section. `BUILD_LOG.md`: an entry with the least-code choices of the design and the completion notes. `docs/KIRO_USAGE.md`: one row for this spec. `.kiro/steering/release.md`: item 4 gains "the recorded sample still loads".
    - Run `pnpm exec vitest run --project web apps/web/test/static` (docs and inventory scans).
    - _Requirements: 7.2, 9.1, 9.2, 9.3, 9.4_

- [ ] 6. Final checks, run once
  - [~] 6.1 Run the full checks
    - Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:pbt`, the clean-checkout web build (`pnpm --filter @reveal-codes/web build` from a fresh clone after `pnpm install`), `pnpm kiro:check` and `pnpm reveal --check`. Fix failures and rerun only what failed. Confirm `git status` shows the recorded file unchanged and its sha256 is `61db329c698fb01b64777ad90b681b0e73682382c95ca04b9a1423ef7c2a2c0e`. Do not push.
    - _Requirements: 1.2, 6.1, 6.3_

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["2.1", "2.2"] },
    { "id": 2, "tasks": ["2.3", "3.1"] },
    { "id": 3, "tasks": ["3.2", "4.1"] },
    { "id": 4, "tasks": ["5.1"] },
    { "id": 5, "tasks": ["6.1"] }
  ]
}
```

## Notes

- Task 1.1 is a gate: if a citation of the recorded file has no Verifier fixture, stop and report before building further. Reading the fixtures found none missing.
- The empty-page "Load demo motion" link keeps its `href` to `demo-motion.txt` only as the no-script fallback. Clicking it must run the same `loadSample('demo')` action as the Toolbar button (preventDefault on click) and install the recorded draft.
