---
inclusion: always
---

# Repository structure

```
reveal-codes/
  .kiro/
    steering/                 this folder; product.md, tech.md, structure.md are always included
    specs/<feature>/          requirements.md, design.md, tasks.md per feature
    hooks/                    one JSON file per hook
    agents/                   one JSON file per custom agent
    settings/mcp.json         MCP servers available to Kiro in this workspace
  packages/
    engine/                   pure provenance + citation-extraction engine (no deps)
      src/
        document.ts           Document, Span, Origin, apply(op)
        ops.ts                Insert/Delete/Replace operations and inverses
        segment.ts            sentence segmentation (lossless)
        citations/            grammar, extract(), format()
        codes.ts              render(doc) -> Reveal Codes text; parse(text) -> structure
        testing/arbitraries.ts
      test/                   *.test.ts (examples) and *.properties.test.ts (PBT)
    verifier/                 CourtListener client, quote matcher, cache, fixtures
    courtlistener-mcp/        MCP server exposing verifier as tools
  apps/
    web/                      Next.js editor
      app/                    routes
      components/editor/      TipTap setup, provenance plugin, RevealCodesPane
      components/assistant/   LLM side panel
      lib/llm/                LlmProvider + bedrock.ts + anthropic.ts
      lib/export/             docx + certification
      demo/                   seeded motion with planted errors + fixtures
  crew/
    sentinel/                 Kiro Crew app: app.json, agents, schedule
  docs/
    KIRO_USAGE.md             inventory of specs/hooks/steering/agents/MCP with file paths
    demo-script.md            the 90-second demo, step by step
  BUILD_LOG.md                dated entries: what was built, what Kiro got wrong, what fixed it
  LICENSE                     Apache-2.0
  README.md
```

## Placement rules

- Anything that can be a pure function goes in `packages/engine`. If it needs the network, `packages/verifier`. If it needs the DOM, `apps/web`.
- New engine capability means: update the spec first, then code, then properties. Never code first.
- Fixtures are committed. A test that needs a new fixture adds it under the package's `fixtures/` with a `README` line saying where it came from and when.
- Every spec task that lands code also lands a line in `docs/KIRO_USAGE.md` if it added or changed a hook, agent, steering file, or MCP tool. A hook enforces this.
