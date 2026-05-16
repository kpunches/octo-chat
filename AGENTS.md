# AGENTS.md

## Project
Chrome extension for WGU Coda commenting workflows.

## Hard constraints
- Never touch production Coda doc ID: 4YIajnJqvo.
- Preserve deletion-safe idle behavior: successful empty _Threads read means clear runtime/sidebar/anchors.
- Do not add broad DOM scans during scroll, pointermove, mousemove, or mutation callbacks.
- Do not make Coda API writes during normal scroll/navigation.
- New comments should render local-first before Coda API consistency catches up.
- Treat Coda DOM ranges/elements as volatile and validate before use.

## Current priorities
- Improve performance and reliability.
- Move toward RuntimeStore + viewport-positioned anchor architecture.
- Prefer small behavior-preserving refactors before feature work.

## Verification
- Run JavaScript syntax checks after changing JS.
- Preserve extension load in Chrome/Chromium.
- Smoke test:
  1. Sidebar loads.
  2. Empty _Threads produces no ghost cards.
  3. Text/cell comment activation works.
  4. New comment creates card.
  5. Card click navigates to anchor.
  6. No full-page anchor search during ordinary scroll.

## Performance goblins
- TreeWalker/full text indexing.
- getBoundingClientRect loops.
- elementsFromPoint on mousemove.
- MutationObserver callbacks doing real work.
- Re-rendering all highlights/cards during scroll.
- Trusting stale DOM ranges.
