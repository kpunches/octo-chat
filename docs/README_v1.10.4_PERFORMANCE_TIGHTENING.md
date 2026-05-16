# v1.10.4 — Performance tightening

This build keeps the v1.10.3 deletion-safe behavior and adds another performance pass.

## Changes

- Keeps hover/pointer DOM surface probing asleep unless the extension is actively in commenting mode.
- Throttles hover probing while commenting.
- Adds lightweight margin-icon position reflow on scroll using already-registered anchors instead of rebuilding text indexes.
- Keeps full highlight/anchor re-resolution delayed until scroll settles.
- Adds counters: `hoverSuppressions`, `iconPositionReflows`, `iconPositionUpdates`, and `registeredAnchors`.

## Console checks

```js
window.__wguPerfReset()
window.__wguPerfReport()
window.__wguGetWriteAudit()
```

During normal scrolling with existing comments, `iconPositionReflows` may increase. `textIndexBuilds` should not climb on every scroll tick.

With zero comments, `runtimeMode` should be `idle`, `cachedThreads` should be `0`, and hover/anchor/highlight work should stay suppressed.
