# Engine benchmark

Manual, outside CI (Req 21.7). Run before a release:

```
pnpm --filter @reveal-codes/engine bench
```

It builds the fixed-seed benchmark Document, measures the four Req 21.1 to 21.3 scenarios, prints the median and p95 for each, and writes `results.json`. It exits non-zero if any scenario exceeds 5 ms (median) or 15 ms (p95). It is not part of `pnpm test`, `pnpm test:pbt`, or `ci.yml`.
