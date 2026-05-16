# v1.11.1 — Viewport-positioned anchors + position-aware sidebar

This build continues the local-first RuntimeStore direction from v1.11.0, but adds a lighter spatial model for comments.

## What changed

### 1. Cached preferred viewport landing position

When an anchor is captured from selected text, a cell, or a block, the extension now records additional local geometry:

- anchor distance from the readable viewport top at capture time
- anchor viewport-height ratio at capture time
- preferred 100px top/bottom landing padding
- current readable viewport height

This is local runtime metadata. It is intended to help card-click navigation land the blue icon/text in a consistent viewport zone without doing full-page text search first.

### 2. Preferred landing on card click

Approximate-scroll recovery now uses a preferred landing Y value instead of the older fixed 35% runway only.

If the viewport size is close to the size at capture time, the extension reuses the captured pixel distance. If the viewport dimensions have changed, it falls back to the captured ratio and clamps the landing area between roughly 100px from the top and 100px from the bottom.

Goal:

```text
Card click -> cheap geometry landing -> Coda mounts nearby content -> scoped anchor resolve
```

Not:

```text
Card click -> full-page text scan -> maybe scroll -> scan again
```

### 3. Runtime anchor position records

The RuntimeStore now tracks anchor position samples keyed by anchor hash:

- documentY
- viewportY
- iconY
- visible / hidden state
- approximate top
- thread IDs
- preferred landing data

Inspect with:

```js
window.__wguRuntimeStoreReport()
```

### 4. Position-aware sidebar ordering

Cards are now ordered by known anchor position when available:

1. live runtime documentY if available
2. stored approximate top if available
3. created/order fallback

This does not yet hide cards or fully virtualize the sidebar. That is intentional. The first step is ordering by anchor geometry without introducing another moving part.

### 5. Performance posture

This build keeps the v1.11.0 principle:

```text
Coda tables = durable truth
RuntimeStore = current page working memory
Coda DOM = volatile rendering surface
```

Normal scrolling should continue to avoid full-page text searching. The blue icon/anchor geometry is used as the fast spatial handle, while exact text matching remains the semantic verification layer.

## Useful test commands

```js
window.__wguPerfReset()
window.__wguRuntimeStoreReport()
window.__wguPerfReport()
window.__wguViewportReport()
```

## Acceptance checks

- Existing cards should sort by their anchor location when approximate geometry exists.
- Clicking a card should land the anchor/icon in a more consistent viewport zone.
- New comments should still create cards and local anchor state immediately.
- Empty Comment Engine tables should still produce no ghost cards.
- Normal scroll should not trigger rapid text index builds.
