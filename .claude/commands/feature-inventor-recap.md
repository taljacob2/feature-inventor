---
description: "While you were sleeping" recap of feature-inventor activity since it was last checked
---

Run `node dist/cli.js recap $ARGUMENTS` from the feature-inventor repo root. If `dist/` is missing
or looks stale, run `npm run build` first.

This shows what shipped, was abandoned, or was reverted since the last time recap was run, and
marks that point in time as seen. Useful extra flags the user might ask for, pass through as
arguments: `--all` (full history, ignore the watermark), `--peek` (preview without marking as
seen), `--since YYYY-MM-DD` (explicit start date).
