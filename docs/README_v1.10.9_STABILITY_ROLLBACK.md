# WGU Coda Comment Assistant v1.10.9 — Stability Rollback

This build intentionally backs out the v1.10.8 anchor-lifecycle hot-path changes after testing showed only the sidebar loaded and page-level activation/highlight/icon behavior failed in both Chrome and Chromium-based Comet.

## Purpose

Restore the last working performance/diagnostic baseline while preserving the earlier safety work:

- deletion-safe idle behavior from v1.10.3
- performance counters and write audit
- diagnostic write lock
- readable viewport diagnostics from v1.10.6
- anchor highlight hardening from v1.10.7

## Deliberately not included

The v1.10.8 anchor-unit lifecycle / softload controller is not active in this build. It should be reintroduced behind a feature flag after root-cause testing, not in the main hot path.

## Useful diagnostics

```js
window.__wguPerfReport()
window.__wguViewportReport()
window.__wguAnchorReport()
window.__wguGetWriteAudit()
```

## Smoke test

1. Load unpacked extension.
2. Refresh the Coda source page.
3. Confirm sidebar loads.
4. Select text and confirm the Comment activation button appears.
5. Post one comment.
6. Confirm comment card, text highlight, and blue icon render.
7. Click the card and confirm the page scrolls toward the anchor.
