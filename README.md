# Reveal Codes

Built for Kiroween 2026 · Resurrection category · resurrecting WordPerfect's Reveal Codes for AI-drafted court filings

A drafting editor for court filings that records the provenance of every character and verifies every legal citation before the document leaves the machine. Its Reveal Codes pane (Alt-F3), named for the WordPerfect 5.1 feature lawyers lost when the profession moved to Word, answers two questions no modern editor answers: where did this sentence come from, and does this case exist and say this?

**Status:** The provenance engine, the citation verifier (`packages/verifier`), the CourtListener MCP server (`packages/courtlistener-mcp`) and the web editor (`apps/web`) are built. Export to DOCX, the print view and the certification are built too.

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
5. Select Export. The button reads "Export (n blocking)" while any blocking issue remains, and the dialog disables both export buttons.
6. Write an override reason for one issue, and correct the others in the text. Verify again. The label drops to "Export" when none remain, and Download .docx produces the filing with its certification.

## Export and certification

Export is always available. The dialog lists every blocking item, and Download .docx and Open print view stay disabled until each red code is fixed or overridden. The .docx has three parts: the filing, the certification statement, and an appendix. The print view at `/print` shows the same three parts, each on its own page.

The statement starts on a new page under the title "AI-Use and Verification Statement". Its six paragraphs print in this order:

1. Names the drafting tool, Reveal Codes, and says it records the origin of every character.
2. States whether generative AI was used. If so, it lists the tools, the share of characters the tool inserted, and how many of those the author later edited. If not, it says none was used.
3. Reports the citation check against CourtListener with the date of the last Verify, and counts how many citations resolved, were not found, were ambiguous or were unchecked. A table lists each citation with its status.
4. Reports the quotation check against the cited opinions, with counts of matched, mismatched and unchecked quotations and a table of each one.
5. Lists the overrides. Each red code the author overrode is printed with its code, its text, the written override reason and the time it was written. This paragraph appears only when there are overrides.
6. Says the author has read the filing in full and takes responsibility for it, followed by a signature line and the date. The date is the local date on your machine when you export or print.

The appendix starts on its own page under the title "Provenance Appendix". It holds the full Reveal Codes record of the filing in monospace, one line per line of the record, so the filing and its provenance can be re-read exactly.

## What leaves your machine

- Verify sends only citation records to this app's own server, and from there only citation strings go to CourtListener. Your draft text is not sent.
- Quotation text is checked in the browser against the opinion and is never sent anywhere.
- Draft, the assistant, sends the prompt and the paragraph at the cursor to the configured LLM provider. Nothing is sent to a provider unless you use Draft. The provider is Amazon Bedrock when `AWS_REGION` and `BEDROCK_MODEL_ID` are set, otherwise Anthropic when `ANTHROPIC_API_KEY` and `ANTHROPIC_MODEL` are set.
- Exporting to DOCX and printing send nothing anywhere; both happen in your browser.
- There is no telemetry.
- A CourtListener token is required for live lookups, because the citation-lookup endpoint answers anonymous requests with 401. Without `COURTLISTENER_TOKEN` the app runs in demo mode on recorded responses and says so in the interface.
- The CourtListener token, if set, is sent only to the CourtListener base URL. It is never cached, logged or sent to the browser.

## How Kiro built this

See docs/KIRO_USAGE.md.

## Licence

Apache-2.0. See [LICENSE](LICENSE).
