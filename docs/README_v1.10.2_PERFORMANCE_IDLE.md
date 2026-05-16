# WGU Coda Comment Assistant v1.10.2 — True Idle Mode + Perf Counters

Purpose: make the extension nearly inert on Coda pages with zero active comment threads.

## What changed

- Added explicit runtime modes: `idle`, `active`, `commenting`, `navigating`.
- Added `window.__wguPerfReport()` and `window.__wguPerfReset()` diagnostics.
- Suppressed anchor resolution, highlight reflow, hover DOM probing, and scroll/resize overlay work while idle.
- If the current page has zero visible active threads, the extension renders the empty sidebar and clears overlays/registries, then enters idle mode.
- Initial boot now performs a single thread load instead of a hard reload plus follow-up loads.
- Mention directory and discussable-field preloads are deferred until comment creation actually needs them.
- Icon asset remains the small navy-outline chat icon; owl assets/references are not present.

## Smoke test

1. Load the unpacked extension.
2. Open a Coda doc/page with the Comment Engine `_Threads` table empty for that source page.
3. Open DevTools Console.
4. Run:

```js
window.__wguPerfReset()
```

5. Scroll and move the mouse around the Coda page for 30 seconds.
6. Run:

```js
window.__wguPerfReport()
```

Expected zero-thread behavior:

- `runtimeMode: "idle"`
- `hasRenderableThreads: false`
- `anchorResolveCalls` should stay `0` or near-zero after reset.
- `textIndexBuilds` should stay `0`.
- `iconsRendered` and `approxIconsRendered` should stay `0`.
- `highlightReflows` should stay `0`.
- `hoverSurfaceChecks` should stay `0` while idle.
- `idleSuppressions` may increase; that is expected and means idle guards are working.

## Notes

This build intentionally avoids feature expansion. It is meant to answer one question first: does an empty-comment Coda page feel normal with the extension installed?
