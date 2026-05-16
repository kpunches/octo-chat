# v1.10.5 — icon scroll stability / no full scroll rebuild

This is a performance/stability build following v1.10.4.

## What changed

- Keeps v1.10.3 deletion-safe idle behavior and v1.10.4 hover suppression.
- Stops ordinary scroll/resize from scheduling a full delayed highlight clear-and-rebuild.
- Repositions existing registered icons during scroll using live range/element rects.
- Hides icons when the live anchor is outside the readable Coda viewport instead of leaving them frozen at the top boundary.
- Reveals icons again when the live anchor rect becomes valid.
- Adds a small idle-time repair pass for missing/hidden icons without clearing all highlights first.

## New diagnostics

Run:

```js
window.__wguPerfReport()
```

Look for:

- `iconPositionHides`
- `iconPositionShows`
- `scrollFullHighlightReflowSuppressions`
- `anchorVisibilityRepairRuns`
- `anchorVisibilityRepairAttempts`
- `anchorVisibilityRepairSuccesses`

## Expected behavior

While scrolling, an icon should either:

1. stay aligned with its live text anchor, or
2. hide when the text leaves the readable viewport.

It should not freeze at the top of the screen while the text scrolls away.
