# WGU Coda Comment Assistant v1.10.6 — Readable Viewport Diagnostics

This build is still performance/UX infrastructure, not feature expansion.

## Goals

- Treat the Coda readable viewport as dynamic state rather than raw `window.innerHeight`.
- Cache readable viewport geometry and invalidate it on meaningful layout changes.
- Make margin icons hide/show based on the readable Coda viewport instead of freezing at browser boundaries.
- Add diagnostics so icon/anchor behavior can be inspected instead of guessed.

## New diagnostic helper

Run this in the DevTools console on a Coda page:

```js
window.__wguViewportReport()
```

It returns:

- browser viewport dimensions
- visual viewport dimensions, where available
- computed readable viewport dimensions
- sidebar open/closed state and rect
- detected scroll container summary
- active anchor/icon visibility details

The previous helpers remain available:

```js
window.__wguPerfReset()
window.__wguPerfReport()
window.__wguSetWriteLock(true)
window.__wguSetWriteLock(false)
window.__wguGetWriteAudit()
```

## Expected behavior

When the anchored text is visible in the readable Coda viewport, the blue comment icon should align with it.

When the anchored text leaves the readable viewport, the icon should hide instead of freezing at the top or bottom of the screen.

When the anchored text returns to the readable viewport and the live anchor is still mounted, the icon should reappear and align again.

## Suggested smoke test

1. Install the unpacked extension.
2. Open the Coda text sandbox page.
3. Create one comment on selected text.
4. Scroll the anchor through the top and bottom boundaries with the sidebar open.
5. Run:

```js
window.__wguViewportReport()
window.__wguPerfReport()
```

Report whether:

- the icon freezes,
- hides cleanly,
- reappears when the text returns,
- or disappears because the anchor was virtualized/unmounted.
