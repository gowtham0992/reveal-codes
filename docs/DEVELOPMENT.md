# Development and hosting

## Why webpack

The web app runs on webpack (`next dev --webpack`, `next build --webpack`), not Turbopack. The Engine imports its sibling files with `.js` specifiers that name `.ts` files. Webpack maps them with `resolve.extensionAlias`; Turbopack in Next 16.4.5 fails to resolve them with "Module not found". Cold starts and rebuilds are slower than the Next default.

The web package's `build` script builds the three packages it references (engine, verifier, export) before `next build`, so a clean checkout builds with `pnpm install` followed by `pnpm --filter @reveal-codes/web build`. CI has a job that does only that.

## Hosting

The app directory is `apps/web`; build it with `pnpm --filter @reveal-codes/web build`. Variables by mode:

- Demo: none.
- Live citations: `COURTLISTENER_TOKEN`, and `REVEAL_CODES_CACHE_DIR` pointing at a writable temporary directory.
- Live assistant on Bedrock: `AWS_REGION`, `BEDROCK_MODEL_ID`, and either `BEDROCK_ROLE_ARN` (a role assumed through the host's OIDC token) or the platform's own credentials.

The role or user should be allowed only `bedrock:InvokeModel` and `bedrock:InvokeModelWithResponseStream` on the one model. Assistant replies are capped at 1,200 output tokens, and `/api/assistant` allows 10 requests per client address per 10 minutes and 200 an hour across all addresses (in memory, per server instance, a courtesy limit and not a guarantee). In live mode `/api/verify` allows 10 requests per client address per minute that reach the citation service (requests answered from the cache are not counted), with a ceiling of 60 requests of any kind per address per minute, and `/api/opinion/[clusterId]` allows 30 per client address per minute, on the same terms; demo mode is never limited. Set secrets in the host's settings; never commit them.
