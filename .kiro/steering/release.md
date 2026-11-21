---
inclusion: manual
---

# Release & submission runbook (#release)

Use this when preparing a tagged build or the Devpost submission.

1. `pnpm lint && pnpm typecheck && pnpm test:pbt` are green locally and in CI on `main`.
2. `docs/KIRO_USAGE.md` matches the actual contents of `.kiro/`. Run the inventory hook manually if unsure: every spec, hook, agent, steering file, and MCP tool is listed with its path and one line on why it exists.
3. `BUILD_LOG.md` has an entry for today and at least one honest entry describing where Kiro produced something wrong and what steering or spec change fixed it.
4. The demo motion (`packages/engine/fixtures/demo-motion.txt`, served from `apps/web/public/`) loads with no environment variables set and all planted errors show the expected codes, and the recorded sample still loads. Walk `docs/demo-script.md` with a stopwatch; it must finish under 90 seconds.
5. Deployed URL responds; MCP server starts with `pnpm mcp` and lists its tools.
6. `LICENSE` is Apache-2.0 and GitHub shows it in the About box.
7. `.kiro/` is not in `.gitignore`. Confirm with `git check-ignore .kiro || echo clean`.
8. Tag: `git tag -a vX.Y.Z -m "..."` and push tags.
