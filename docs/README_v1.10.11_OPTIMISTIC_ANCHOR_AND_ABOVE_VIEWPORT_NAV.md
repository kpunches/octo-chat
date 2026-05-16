# v1.10.11 — Optimistic Anchor Render + Above-Viewport Navigation

Focused fixes after v1.10.10 testing:

- New comments now render their local/synthetic anchor immediately instead of waiting for Coda API/formula consistency.
- Synthetic comment rows now carry page/context/approximate geometry fields from the selection payload.
- Cell-overlay selections and whole-cell comments now capture approximate geometry from the original source element.
- Card-click staged recovery now assists nested/internal Coda scroll containers as well as window scrolling. This is intended to fix anchors above the viewport that previously reported “Anchor not currently visible.”

Test commands:

```js
window.__wguPerfReset()
window.__wguPerfReport()
window.__wguViewportReport()
window.__wguAnchorReport()
```

Expected:

- New comment card appears and the text/icon anchor should render quickly, not minutes later.
- Card click should recover anchors above and below the viewport.
- Ordinary scroll performance guards remain in place.
