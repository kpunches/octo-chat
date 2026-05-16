# v1.10.10 — activation restoration + card navigation polish

Focused smoke-test build after v1.10.9 rollback.

Changes:

- Restores the cell comment activation bubble while the sidebar is open without returning to unrestricted idle hover probing.
- Keeps hover probing suppressed while the extension is truly idle.
- Treats stale/hidden blue icons without a live text range as unreliable navigation targets.
- Lets card click fall through to exact resolve / stored approximate offset recovery when a stale overlay record cannot navigate.
- Adds requested card visual states:
  - active: royal blue border, light blue background, 225-degree-style drop shadow
  - inactive: midnight blue border, light gray background

Smoke test:

1. Load unpacked extension.
2. Open sidebar.
3. Hover/select in Coda sandbox/source text or table cell.
4. Verify activation bubble/toolbar appears.
5. Create comment and verify card appears.
6. Scroll anchor below viewport and click card.
7. Scroll anchor above viewport and click card.
8. Run diagnostics if needed:
   - window.__wguPerfReport()
   - window.__wguViewportReport()
   - window.__wguAnchorReport()
