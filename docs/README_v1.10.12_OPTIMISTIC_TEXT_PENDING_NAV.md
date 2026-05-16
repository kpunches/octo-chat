# WGU Coda Comment Assistant v1.10.12

Focused patch after v1.10.11 smoke testing.

## Changes

- Keeps the v1.10.11 optimistic icon / above-viewport navigation behavior.
- Adds a short-lived live selection range cache for newly-created comments so the selected text highlight can render immediately instead of waiting for Coda/API formula consistency.
- Forces the first optimistic text highlight commit immediately after posting a comment.
- Changes staged card-click recovery to show an in-progress title only, not the warning/error card state, while the extension is still scrolling/recovering the anchor.
- Simplifies comment card styling: midnight blue border for active and inactive cards, very light blue active background, white inactive background, no royal-blue border and no heavy drop shadow.

## Quick test

1. Create a fresh comment. The card, icon, and highlighted selected text should appear quickly.
2. Scroll the anchor above the viewport and click the card. It should recover upward without showing the persistent “Anchor not currently visible” warning unless recovery actually fails.
3. Confirm card styling: inactive cards are white with midnight blue border; active card is very light blue with midnight blue border.
