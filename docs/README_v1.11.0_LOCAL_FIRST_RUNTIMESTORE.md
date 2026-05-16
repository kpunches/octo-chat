# WGU Coda Comment Assistant v1.11.0 — Local-first RuntimeStore

This build begins moving the extension from “Coda/API + Coda DOM directly drive UX” to a local-first runtime model.

## Main goals

- Keep Coda as durable storage, but use an in-memory RuntimeStore as the immediate source for sidebar/page UX.
- Create new comments locally first, then sync to Coda asynchronously.
- Capture and reuse anchor snapshots at comment creation time.
- Avoid using slow Coda label/table lookups in the critical path when the live DOM already supplied good labels.
- Render page anchors lazily: active, synthetic/pending, and near-viewport rows first instead of all comments on every refresh.
- For cell/block comments, prefer a lightweight block/cell overlay when exact text cannot be reliably resolved in the virtualized Coda DOM.

## Diagnostics

Open DevTools on the Coda page and run:

```js
window.__wguRuntimeStoreReport()
window.__wguPerfReport()
window.__wguViewportReport()
window.__wguAnchorReport()
```

## Expected improvements

- New comment cards should appear from local state immediately.
- Comment creation should avoid avoidable Coda API lookups before showing local UI.
- Existing large pages should do less anchor/highlight work during ordinary rendering.
- Cell comments should have a reliable lightweight visual even when exact text highlight is unavailable.

## Important behavioral note

This build intentionally does not try to continuously highlight every comment on the page. The sidebar can show all comments, but page DOM work is limited to active/local/near-viewport anchors to protect browser responsiveness.
