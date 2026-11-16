See `manifest.json`: it lists every fixture here with its source, whether it was recorded (with date) or hand-authored, and where it came from. Cluster ids 999000003 and 999000004 (the synthetic `1 Hill 150`) are placeholders, not real CourtListener ids. The files under `source/` are the verbatim opinion excerpts behind `opinions/`; see `source/README.md`.

Quote fixtures were chosen from regions that match both the supplied LII excerpts and CourtListener's own text, because CourtListener's text has OCR errors and typographic differences (see the manifest notes), so the quotes stay valid whichever source is checked.

Recorded citation-lookup fixtures added by case-match (all `courtlistener-live`, recorded 2026-11-15 with `scripts/record-lookups.ts`; clusters trimmed to identifying fields; no request headers kept):

- `lookup/925-f3d-1339.json`: `925 F.3d 1339`, status 404.
- `lookup/905-f-supp-2d-121.json`: `905 F. Supp. 2d 121`, status 200, cluster 2661490 (United States v. ISS Marine Services, Inc.).
- `lookup/174-f3d-366.json`: `174 F.3d 366`, status 200, cluster 3011108 (Greenleaf v. Garlock, Inc.).
- `lookup/516-f3d-1237.json`: `516 F.3d 1237`, status 404.
- `lookup/516-us-217.json`: `516 U.S. 217`, status 200, cluster 117990 (Zicherman v. Korean Air Lines Co.).
- `lookup/501-us-32.json`: `501 U.S. 32`, status 200, cluster 112616 (Chambers v. Nasco, Inc.).
- `lookup/556-us-662.json`: re-fetched 2026-11-15 to keep `case_name_full` and `case_name_short`.
