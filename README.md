# Reveal Codes

Built for Kiroween 2026 · Resurrection category · resurrecting WordPerfect's Reveal Codes for AI-drafted court filings

A drafting editor for court filings that records the provenance of every character and verifies every legal citation before the document leaves the machine. Its Reveal Codes pane (Alt-F3), named for the WordPerfect 5.1 feature lawyers lost when the profession moved to Word, answers two questions no modern editor answers: where did this sentence come from, and does this case exist and say this?

**Status:** The provenance engine, the citation verifier (`packages/verifier`), the CourtListener MCP server (`packages/courtlistener-mcp`) and the web editor (`apps/web`) are built. Export to DOCX and PDF and the certification are not.

## Run it

```
pnpm install
pnpm dev
```

The editor opens at http://localhost:3000. Copy `.env.example` to `.env` to set a token or an assistant provider; with no variables set the app runs in demo mode. Other commands: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:pbt`, `pnpm mcp`.

The web app runs on webpack (`next dev --webpack`, `next build --webpack`), not Turbopack. The Engine imports its sibling files with `.js` specifiers that name `.ts` files. Webpack maps them with `resolve.extensionAlias`; Turbopack in Next 16.4.5 fails to resolve them with "Module not found". Cold starts and rebuilds are slower than the Next default.

## Demo path

No account and no token are needed.

1. Run `pnpm dev` and open the app.
2. Select Load demo motion. The text enters as one `PST` span.
3. Press Alt-F3 to open the Reveal Codes pane.
4. Select Verify. Citations and quotations get their codes; the planted errors show as red codes and in the Issues list as blocking.
5. Select Export. It is disabled and reads "Export (n blocking)" while any blocking issue remains.
6. Write an override reason for one issue, and correct the others in the text. Verify again. The label drops to "Export" when none remain, and Export opens a placeholder dialog.

## What leaves your machine

- Verify sends only citation records to this app's own server, and from there only citation strings go to CourtListener. Your draft text is not sent.
- Quotation text is checked in the browser against the opinion and is never sent anywhere.
- Draft, the assistant, sends the prompt and the paragraph at the cursor to the configured LLM provider. Nothing is sent to a provider unless you use Draft. The provider is Amazon Bedrock when `AWS_REGION` and `BEDROCK_MODEL_ID` are set, otherwise Anthropic when `ANTHROPIC_API_KEY` and `ANTHROPIC_MODEL` are set.
- There is no telemetry.
- A CourtListener token is required for live lookups, because the citation-lookup endpoint answers anonymous requests with 401. Without `COURTLISTENER_TOKEN` the app runs in demo mode on recorded responses and says so in the interface.
- The CourtListener token, if set, is sent only to the CourtListener base URL. It is never cached, logged or sent to the browser.

## How Kiro built this

See docs/KIRO_USAGE.md.

## Licence

Apache-2.0. See [LICENSE](LICENSE).
