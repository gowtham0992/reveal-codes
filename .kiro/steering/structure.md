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
        codes.ts              render(doc, mode) -> Reveal Codes text (full | display); parse(fullText) -> document
        testing/arbitraries.ts
      test/                   *.test.ts (examples) and *.properties.test.ts (PBT)
    verifier/                 CourtListener client, quote matcher, cache, fixtures
    courtlistener-mcp/        MCP server exposing verifier as tools
    export/                   pure export package: gate, certification statement, appendix, DOCX builder, file name (depends on engine and docx)
  apps/
    web/                      Next.js editor (source under apps/web/src/ and apps/web/app/, tests under apps/web/test/)
      app/                    Next App Router: layout.tsx, page.tsx, globals.css, api/ route files (assistant, mode, opinion/[clusterId], verify) that import only src/server/
      src/
        store.ts              app Store: Document, selection, notices, run log; actions return new state
        store-actions.ts      Store action handlers
        store-runtime.ts      subscription and dispatch runtime around the Store
        history.ts            undo and redo stacks, emptied by the history barrier
        persist.ts            Persisted_Value encode and decode for localStorage
        autosave.ts           debounced autosave and mount-time load
        services.ts           AppServices (fetch, storage, clock, timers) and defaultServices
        notices.ts            Notice text for the status region
        assistant-run.ts      assistant run bookkeeping (Tier 2)
        index.ts              package entry
        editor/               TipTap setup, provenance plugin, clipboard, reconcile, shortcuts, offset mapping
        pane/                 Reveal Codes pane: layout.ts, pane.tsx, pane.module.css
        client/               browser-side flows: api.ts, verify-flow.ts, verify-summary.ts, divergence.ts, assistant-client.ts
        server/               route logic: deps.ts (only reader of process.env), http.ts, body.ts, verify, opinion, mode and assistant routes, llm*.ts (draft provider selection)
        components/           React components with one CSS module each: app-shell, toolbar, editor-surface, issues list and region, dialogs, status line, assistant column and panel
      scripts/                copy-demo.ts (predev and prebuild)
      fixtures/assistant/     recorded assistant response used by the fixture LLM provider
      public/                 demo-motion.txt, copied from packages/engine/fixtures by copy-demo.ts; gitignored
      test/                   *.test.ts(x) examples and *.properties.test.ts (PBT)
        static/               source scans: boundaries, css-rules, copy-rules, limits, forbidden, env-and-size, package-json, docs, inventory
        support/              shared test helpers: fc.ts, clock.ts, memory-storage.ts, dom-shims.ts, render.tsx, scan.ts, fetch fakes
        smoke/                API assumption regression tests for ProseMirror and TipTap
  crew/
    sentinel/                 the sweep CLI that the Reveal Codes Sentinel Crew app (separate repository) runs on a schedule
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
