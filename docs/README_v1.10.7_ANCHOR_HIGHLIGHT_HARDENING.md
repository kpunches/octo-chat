# v1.10.7 — Anchor Highlight Hardening

Focused patch for duplicate/phantom native text highlights.

Changes:
- Keeps v1.10.6 readable viewport diagnostics.
- Suppresses native text highlights when the resolved DOM range text does not resemble the stored anchor text.
- Ignores stale Current Matched Text values that diverge too far from the original anchor text.
- Prevents low-confidence/context fallback matches from overwriting the stored current match with unrelated text.
- Adds diagnostics: `window.__wguAnchorReport()`.
- Adds perf counters: `nativeHighlightSuppressions`, `staleCurrentMatchSuppressions`.

Useful diagnostics:
```js
window.__wguViewportReport()
window.__wguAnchorReport()
window.__wguPerfReport()
```

Expected behavior:
- One thread should produce one text highlight anchored to the actual selected text.
- If Coda virtualizes the anchor, the icon/highlight may disappear temporarily, but unrelated text should not be painted.
