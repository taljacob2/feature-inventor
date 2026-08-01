# Changelog

Append-only log of what the nightly loop actually shipped. Every entry
should be traceable to a git commit. This is the record a human reads each
morning to answer "what happened while I was asleep."

Format per entry:

```
## YYYY-MM-DD — <feature title>
- Effort/value estimate vs actual:
- Sanity checks: <pass/fail, what was checked>
- Commit: <sha>
- Notes from re-evaluation:
```

## 2026-08-01 — Clean error + non-zero exit in cli.ts for missing/malformed ROADMAP.md or CHANGELOG.md
- Effort/value estimate vs actual: ICE 6/8/9 (composite 7.7) — matched; the fix was a small try/catch wrapper as expected.
- Sanity checks: pass — `npm test` (10/10 tests, including 3 new cli.test.ts cases) and `npm run build` both green; manually ran `dist/cli.js status` from a directory with no ROADMAP.md/CHANGELOG.md and confirmed a one-line `Error: could not read ROADMAP.md (...)` message with exit code 1, and confirmed normal `status` output still works from the repo root.
- Commit: this commit
- Notes from re-evaluation:
