# WGU Coda Comment Assistant v1.10.3 — Deletion-Safe Idle + Write Audit

Focused diagnostic/hardening build. No feature expansion.

## What changed

- Bumped manifest/content runtime to v1.10.3.
- A successful empty `_Threads` read is now authoritative.
  - Clears `lastFetchedPageChats`.
  - Clears `optimisticChats` and optimistic reply/status caches.
  - Clears anchors, highlights, active/focus state, and sidebar cards.
  - Enters true `idle` runtime mode.
- Added Coda write auditing at the central `codaFetch()` wrapper.
- Added a diagnostic write lock.

## Console diagnostics

```js
window.__wguPerfReport()
window.__wguPerfReset()
window.__wguGetWriteAudit()
window.__wguSetWriteLock(true)   // block POST/PUT/PATCH/DELETE
window.__wguSetWriteLock(false)  // restore writes
```

## Deletion / rehydration test

1. Load this unpacked extension.
2. Open the test Coda source page.
3. In DevTools console, run:

```js
window.__wguPerfReset()
window.__wguSetWriteLock(true)
```

4. Delete all rows in the Comment Engine `_Threads` / `_Messages` tables.
5. Refresh the source Coda page.
6. Scroll and move around.
7. Run:

```js
window.__wguPerfReport()
window.__wguGetWriteAudit()
```

Expected with all Comment Engine rows deleted:

- `runtimeMode: "idle"`
- `cachedThreads: 0`
- `optimisticThreads: 0`
- `renderedIcons: 0`
- `renderedHighlights: 0`
- no cards in sidebar
- no unblocked write audit entries while the write lock is enabled

If rows still reappear while the write lock is enabled, the extension did not write them during that session; the reappearance is likely Coda API/UI/server sync returning stale rows or another client/automation writing them.

If rows stop reappearing with the write lock enabled but reappear when it is disabled, inspect `window.__wguGetWriteAudit()` to identify the extension write path.
