---
description: Ask a running (or about-to-run) feature-inventor nightly loop to stop gracefully
---

Run `node dist/cli.js stop $ARGUMENTS` from the feature-inventor repo root. If `dist/` is missing
or looks stale, run `npm run build` first. Pass `--cancel` through if the user wants to undo a
pending stop request instead of making a new one.

Explain what this actually does: it does not hard-kill anything. The nightly loop checks for this
request between features, so it finishes whatever feature it's currently implementing/verifying,
skips starting another one, still updates ROADMAP.md/CHANGELOG.md, and then exits.
