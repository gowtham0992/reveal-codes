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

### Hosting

The app directory is `apps/web`; build it with `pnpm --filter @reveal-codes/web build`. Variables by mode:

- Demo: none.
- Live citations: `COURTLISTENER_TOKEN`, and `REVEAL_CODES_CACHE_DIR` pointing at a writable temporary directory.
- Live assistant on Bedrock: `AWS_REGION`, `BEDROCK_MODEL_ID`, and either `BEDROCK_ROLE_ARN` (a role assumed through the host's OIDC token) or the platform's own credentials.

The role or user should be allowed only `bedrock:InvokeModel` and `bedrock:InvokeModelWithResponseStream` on the one model. Assistant replies are capped at 1,200 output tokens, and `/api/assistant` allows 10 requests per client address per 10 minutes (in memory, per server instance, a courtesy limit and not a guarantee). Set secrets in the host's settings; never commit them.

## Demo path

No account and no token are needed.

1. Run `pnpm dev` and open the app.
2. Select Load demo motion. The text enters as one `PST` span. The motion cites the Fifth Circuit and N.D. Tex.
3. The Reveal Codes pane is already open on a first visit; Alt-F3 hides and shows it, and the app remembers your choice.
4. Select Verify. Citations and quotations get their codes; the planted errors show as red codes and in the Issues list as blocking. Read the result of Verify (counts and check time) as text in the Issues region.
5. Select Export. The toolbar button reads "Export (n blocking)" while any blocking issue remains. In the dialog, Download .docx and Open print view carry no count and stay disabled while blocking items remain.
6. Write an override reason for one issue, and correct the others in the text. Verify again. The toolbar label drops to "Export" when none remain, and Download .docx produces the filing with its certification.

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

## Court-specific certification

Some federal courts and judges ask for their own AI statement. The Export dialog has a Picker labelled "Court or judge", above the Issues list. Choose a court or judge and the dialog shows a one-line summary of the instrument, its key language and a link to the source. The choice is saved in your browser, and the print view uses it too. The default is no selection, which gives the standard statement. Reveal Codes states what the order says; it does not tell you what the law requires, so read the source before you file.

Three examples:

- N.D. Tex., Local Civil Rule 7.2(f): a brief prepared with generative AI must say so on its first page under the heading "Use of Generative Artificial Intelligence". The DOCX and the print view put that heading on the first page of the filing.
- E.D. Tex., Judge Love: every filing carries a "Certificate of Generative Artificial Intelligence Usage". The statement takes that title, and the Sentinel recognises it when it reads the file back.
- S.D. Ohio, Judge Newman: the standing order bars the use of AI in preparing any filing. The dialog shows this as a notice with no override, because it is not a red code. It does not count toward the "Export (n blocking)" label. The notice states the prohibition once, in a single line that counts the AI-origin passages left in the filing and quotes the first, for example "1 AI-origin passage remains: paragraph 2, beginning "…"." The key language of the order appears once, in the summary.

Where an order asks how AI was used, the statement says where. It lists the passages the program drafted: each is a paragraph number plus the first words of the passage, up to five, then a count of any more. Paragraphs are counted from the first line of the caption, skipping blank lines.

If the only AI text was drafted by the demo assistant with no provider configured, the statement does not name a model. It says the text came from a recorded demonstration response and that no model was called.

The orders come from `data/standing-orders.json`. See [data/README.md](data/README.md) for its fields and sources. The dataset is released under CC0.

## What leaves your machine

- Verify sends only citation records to this app's own server, and from there only citation strings go to CourtListener. Your draft text is not sent.
- Quotation text is checked in the browser against the opinion and is never sent anywhere.
- Draft, the assistant, sends the prompt and the paragraph at the cursor to the configured LLM provider. Nothing is sent to a provider unless you use Draft. The provider is Amazon Bedrock when `AWS_REGION` and `BEDROCK_MODEL_ID` are set, otherwise Anthropic when `ANTHROPIC_API_KEY` and `ANTHROPIC_MODEL` are set.
- Exporting to DOCX and printing send nothing anywhere; both happen in your browser.
- There is no telemetry.
- A CourtListener token is required for live lookups, because the citation-lookup endpoint answers anonymous requests with 401. Without `COURTLISTENER_TOKEN` the app runs in demo mode on recorded responses and says so in the interface.
- The CourtListener token, if set, is sent only to the CourtListener base URL. It is never cached, logged or sent to the browser.

## Sentinel

The Sentinel re-checks exported filings. It reads each `.docx` in a folder, reads the Provenance Appendix back out of it, asks CourtListener the same questions the editor asked, and reports where the answer differs from the record the file carries. It reports these checks:

- Body edited: the filing text no longer matches the text the Appendix records.
- Citation changed: a citation's verification status differs from the recorded one, or now points at another decision.
- Quote changed: a quotation's check result differs from the recorded one.
- Override no longer needed: an override sits on an issue that is no longer an issue.
- Recheck unavailable: CourtListener could not be reached or throttled the request, so the record was left as is.
- Unreadable: the file is not a Reveal Codes export, or could not be read or parsed.

```
pnpm sentinel sweep ~/Filings
```

The report is Markdown on stdout. Its second line states the mode, `fixtures` or `live`. Only citation strings and cluster ids go to CourtListener; no draft text is sent. The Sentinel reads four environment variables:

- `COURTLISTENER_TOKEN`: token for live lookups; without it the Sentinel runs on recorded fixtures.
- `REVEAL_CODES_FIXTURES_ONLY`: set to `1` to force fixtures mode even when a token is set.
- `REVEAL_CODES_CACHE_DIR`: directory for the lookup cache; the default is `~/.reveal-codes/cache`, shared with the web app.
- `COURTLISTENER_BASE_URL`: overrides the CourtListener API base URL.

The Kiro Crew app that schedules the Sentinel lives in a separate repository: https://github.com/gowtham0992/reveal-codes-sentinel. The app was installed in Kiro Crew 0.12.0 and its nightly job run once over three sample filings on 2026-11-09; the run swept all three and reported the one edited after export.

## Working on this repo with Kiro

- Pick the `release-checker` agent before a release. It is read-only: it runs the runbook checks and prints one table with the HEAD SHA.
- Pick the `orders-curator` agent to add or update one court order in `data/standing-orders.json`, from a `.uscourts.gov` source.
- The `add-standing-order` skill holds the procedure the curator follows; it also activates when you ask to add a standing order.
- `pnpm kiro:check` fails if a file under `.kiro/` is missing from `docs/KIRO_USAGE.md`, or if the table names a path that does not exist.

## How Kiro built this

See docs/KIRO_USAGE.md.

## Licence

Apache-2.0. See [LICENSE](LICENSE).
