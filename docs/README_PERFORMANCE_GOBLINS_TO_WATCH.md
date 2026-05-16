# Performance goblins to watch

This extension runs inside Coda, which is a large virtualized SPA. The extension must stay lazy and scoped. These are the goblins most likely to slow the browser or create weird behavior.

## 1. Full-page text scans

Watch for counters such as:

```js
window.__wguPerfReport().textIndexBuilds
window.__wguPerfReport().anchorResolveCalls
```

Normal scrolling should not cause these to climb rapidly. Full-page text search should be a last resort after cheap geometry and nearby scoped resolution fail.

## 2. Scroll-time highlight rebuilds

The extension should not clear/rebuild every highlight during ordinary scroll. That creates flicker, stale icons, and lag.

Healthy behavior:

```text
scroll -> cheap icon/geometry update
scroll settles -> limited repair only if needed
```

Unhealthy behavior:

```text
scroll -> clear all -> search all -> repaint all
```

## 3. Pointer/mouse DOM probing

Anything based on `pointermove`, `mousemove`, `elementsFromPoint`, or repeated `getBoundingClientRect()` can become expensive quickly.

Hover/cell probing should only happen when the comment UI actually needs it, not when the extension is idle.

## 4. Stale DOM references

Coda can re-render or virtualize content at any moment. Cached DOM ranges/elements are hints, not truth.

Before using a cached range/element, the extension should validate:

- still connected to the document
- rect is sane
- not in Coda chrome/toolbars
- text still resembles stored anchor text
- inside or near the readable viewport

## 5. Coda API timing in the UX path

Coda API writes/reads and formula fields can lag. New comment UX should not wait on Coda rows to settle.

Correct model:

```text
capture local anchor -> render local pending card/icon/highlight -> write to Coda in background -> reconcile later
```

## 6. Zombie cache state

Successful empty Coda reads must clear local state. This was fixed earlier, but it remains a regression risk.

Healthy empty state:

```text
runtimeMode: idle
cachedThreads: 0
optimisticThreads: 0
iconsRendered: 0
highlight work: 0
```

## 7. Too many sidebar cards doing live work

The sidebar can show many cards, but page DOM work should be limited to active, visible, or nearby anchors.

Next likely optimization: a viewport/nearby sidebar mode with a separate All Comments mode.

## 8. Coda writebacks during navigation/scroll

Avoid writing anchor match status back to Coda during normal scroll or every navigation repair. Writes should happen on durable events only:

- comment created
- reply posted
- resolved/unresolved
- manual anchor repair
- explicit diagnostic action

## Quick smoke test

With all Comment Engine rows deleted:

```js
window.__wguPerfReset()
// refresh, scroll, move mouse
window.__wguPerfReport()
```

Expected:

```text
runtimeMode should be idle
textIndexBuilds should stay at 0 or near 0
hoverSurfaceChecks should stay low
icons/highlights should not render
```
