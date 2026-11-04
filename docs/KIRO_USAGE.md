| Kind | Name | Path | Why it exists |
| ---- | ---- | ---- | ------------- |
| Hook | Commit after spec task | .kiro/hooks/commit-on-task.json, scripts/commit-task.sh | PostTaskExec: commits the working tree as `feat(engine): <task title>` (subject capped at 72 chars, full title in the body when cut). Never pushes or amends; exits 0 when there is nothing to commit. |
| Hook | Engine tests on save | .kiro/hooks/engine-tests-on-save.json | PostFileSave on packages/engine/src and packages/engine/test `.ts` files: runs `pnpm vitest run --project engine --passWithNoTests`, killed after 120 s. |
