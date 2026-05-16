# Next architecture direction after v1.11.1

The current direction is to stop making exact text highlighting the central runtime dependency. The better architecture is spatial-first, semantic-second.

## Core principle

```text
Anchor runtime record = source of truth
Blue icon = fast visible handle
Text/cell highlight = verified visual detail
Sidebar card = projection of anchor position and thread state
```

The icon should not be the durable truth by itself, but its position/geometry can become the fast spatial handle that helps cards and highlights stay coordinated.

## Proposed next version: v1.11.2 or v1.12.0

### 1. Nearby sidebar mode

Default sidebar mode should eventually show:

- active thread
- visible anchor cards
- near-viewport anchor cards
- recently visible anchor cards

Cards should be ordered by anchor position, not database insertion order.

A separate **All Comments** mode can still show every thread, possibly virtualized/lazy-loaded.

### 2. Position store as a first-class service

Promote `anchorPositionsByHash` into a more formal AnchorPositionStore:

```js
{
  threadId,
  hash,
  documentY,
  viewportY,
  iconY,
  visible,
  nearViewport,
  approximate,
  lastMeasuredAt
}
```

Icon renderer, sidebar renderer, and navigation should all read from this store instead of talking directly to each other.

### 3. Cell comments should use cell/block overlay first

Cell comments do not need exact internal text highlighting to be useful. They should use a lightweight cell/block-level overlay plus blue icon.

Selected-text comments can still use exact text highlighting, but only after the local region has been verified.

### 4. Exact text search should be scoped

For selected text:

```text
anchor geometry says where to look
text resolver verifies exact match nearby
highlight paints only if verified
```

Full-page text search should be reserved for explicit repair or last-resort card click behavior.

### 5. Better new-comment local-first flow

At comment creation time, the extension has the best possible data:

- selected range
- selected text
- cell/block element
- rect
- viewport position
- nearby context
- page URL/key

That local snapshot should power immediate UX. Coda persistence should reconcile after.

### 6. Session storage, carefully

Consider using `chrome.storage.session` only for short-lived recovery:

- pending writes
- recent anchor snapshots
- last active thread

Do not turn browser storage into a second durable comment database. Coda remains durable truth.

## Strong recommendation

The next large improvement should not be another tiny icon patch. It should be a small internal refactor around three services:

```text
RuntimeStore
AnchorPositionStore
SidebarProjection
```

That keeps data flow one-way:

```text
Coda sync -> RuntimeStore -> AnchorPositionStore -> Icon/Highlight/Sidebar renderers
```

No more icon-to-card or card-to-highlight cross-chatter. Goblins love cross-chatter.
