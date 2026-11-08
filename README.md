# Reveal Codes

Built for Kiroween 2026 · Resurrection category · resurrecting WordPerfect's Reveal Codes for AI-drafted court filings

A drafting editor for court filings that records the provenance of every character and verifies every legal citation before the document leaves the machine. Its Reveal Codes pane (Alt-F3), named for the WordPerfect 5.1 feature lawyers lost when the profession moved to Word, answers two questions no modern editor answers: where did this sentence come from, and does this case exist and say this?

**Status:** The provenance engine, the citation verifier (`packages/verifier`) and the CourtListener MCP server (`packages/courtlistener-mcp`) are built. The web editor is not.

## Run it

```
pnpm install
pnpm lint
pnpm typecheck
pnpm test
pnpm test:pbt
pnpm dev
pnpm mcp
```

## What leaves your machine

- Only citation strings go to CourtListener, never your draft text. The verifier sends the formatted `<volume> <reporter> <page>` lines, one text request per chunk of lines, with the lines joined by newlines.
- Draft text goes to an LLM provider only when you use the assistant.
- There is no telemetry.
- The CourtListener token, if set, is sent only to the CourtListener base URL. It is never cached or logged.

## How Kiro built this

See docs/KIRO_USAGE.md.

## Licence

Apache-2.0. See [LICENSE](LICENSE).
