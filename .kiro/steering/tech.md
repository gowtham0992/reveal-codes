---
inclusion: always
---

# Technology standards

## Stack

- TypeScript 5.x, strict mode, everywhere. No JavaScript source files.
- pnpm workspaces. Packages: `packages/engine`, `packages/verifier`, `packages/courtlistener-mcp`, `packages/export`; apps: `apps/web`; sweep CLI: `crew/sentinel`.
- `packages/engine` has **zero runtime dependencies** and must not import from `node:` or the DOM. It is pure functions over plain data.
- `packages/verifier` takes `fetch` as an injected dependency. Tests never touch the network; they use recorded fixtures in `packages/verifier/fixtures/`.
- `packages/courtlistener-mcp` uses `@modelcontextprotocol/sdk` over stdio. Tool handlers are thin wrappers over `packages/verifier`.
- `apps/web` is Next.js (App Router) with TipTap on ProseMirror. Provenance is captured in a ProseMirror plugin that inspects every transaction; it is the only place origin is assigned.
- LLM access goes through one interface, `draft(prompt, context): AsyncIterable<string>` in `apps/web/src/server/llm.ts`. The provider is chosen by which credentials are set: Amazon Bedrock (`AWS_REGION` and `BEDROCK_MODEL_ID`), else Anthropic (`ANTHROPIC_API_KEY` and `ANTHROPIC_MODEL`), else a recorded-response fixture provider. There is no `LLM_PROVIDER` variable and no hard-coded model id. No other module imports a provider SDK.
- Export uses the `docx` package for DOCX and print CSS for PDF.

## Commands (must stay true; CI runs them)

```
pnpm install
pnpm lint          # eslint + prettier check
pnpm typecheck     # tsc -b
pnpm test          # vitest unit + property tests, all packages
pnpm test:pbt      # property tests only, numRuns=500
pnpm dev           # apps/web on :3000
pnpm mcp           # starts courtlistener-mcp on stdio
pnpm sentinel   # sweep a folder of exported .docx files for drift
```

## Property-based testing

- Library: **fast-check** with vitest. Do not generate Hypothesis or any Python; this repository has no Python.
- Every invariant in a spec's `design.md` `Property N` list gets exactly one `fc.assert(fc.property(...))` in a file named `<module>.properties.test.ts`, with a comment `// Property N` above it and `_Requirements: x.y_` in the describe title.
- `numRuns` ≥ 200 locally, 500 in CI. Seeds are logged on failure and must be reproducible with `fc.assert(..., { seed })`.
- Arbitraries live in `packages/engine/src/testing/arbitraries.ts` and are shared. Write arbitraries for: document text, edit-operation sequences, citation strings (valid, near-miss, and garbage), and opinion bodies with embedded quotes.
- A property that only checks the function does not throw is not a property. Each one must assert a relationship between input and output.

## Testing rules that apply to all tests

- No `try/catch` that swallows errors in tests or in source to make a test pass.
- No tests that only import a module. No tests with a single `expect(true)`.
- No snapshot tests for the engine; properties and examples only.
- If a test is hard to write, the design is wrong; say so in `BUILD_LOG.md` rather than weakening the test.

## Code style

- Named exports only. No default exports outside Next.js route files.
- Plain data types (`type`, discriminated unions) over classes. Engine state is immutable; operations return new values.
- Errors are values in the engine (`Result<T, E>`); throw only at the app boundary.
- No `any`. `unknown` plus narrowing.
- Functions under 40 lines; modules under 300. Split rather than scroll.

## Secrets and config

- `.env.example` lists every variable with a comment. Never commit `.env`.
- `COURTLISTENER_TOKEN` is required for live lookups: CourtListener's citation-lookup endpoint answers an anonymous POST with 401 (checked 2026-11-07). Without a token the app runs in demo mode on recorded responses and says so in the UI.
- The demo motion comes from `packages/engine/fixtures/demo-motion.txt`, copied to `apps/web/public/` by `apps/web/scripts/copy-demo.ts`, and must work with no tokens at all, with citation lookups served from recorded fixtures.
