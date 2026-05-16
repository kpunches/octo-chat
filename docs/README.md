# WGU Coda Comment Assistant

Version: 1.8.1

## 1.9.31 - Detail View Display Field Labels

- Uses the visible detail-layout field label above/left of a protected cell as the display Field Name.
- Keeps the stable column ID as identity even when the detail view label is a layout override.
- Preserves normal table header behavior when visible column headers are available.
- Fixes the column-header fallback to use the actual source cell safely.

## 1.9.30 - Table metadata hardening

- Makes table-cell detection more stubborn for rich text and hyperlink selections by checking selection start/end nodes, multiple range client rects, and Coda table identity attributes before falling back to canvas text.
- Fixes literal word-boundary regex corruption that prevented `grid-*`, `v-*`, `i-*`, `row-*`, and `c-*` IDs from being recovered from DOM context.
- Fixes undefined `tableName` and `fieldContextLabel` references during comment creation.
- Preserves human page/table/column labels while storing table/view/row/column IDs as stable identity.

## Changes in 1.4.1

- Removed the soft connector line.
- Strengthened the non-invasive push panel behavior.
- Added richer Word-like comment cards:
  - status chip
  - priority chip
  - field
  - anchor status
  - latest activity
  - Reply
  - Locate
  - Resolve
  - Critical
  - Normal
- Reply appends to `Comment Log`.
- Resolve updates `Stage` to `Resolved`.
- Critical/Normal update `Priority`.
- Still does not wrap or reparent the Coda app DOM.

## Defaults

- Doc ID: `zR7eW6CJsf`
- `_CommentTarget`: `grid-GYhi07Ef8b`
- `_Chats`: `grid-v3OHNxj6U-`
- `_DiscussableFields`: `grid-vUUFPHUJhv`
- Panel width: `390`

## Install

1. Remove/disable the old unpacked extension.
2. Unzip this package.
3. Load unpacked in `chrome://extensions`.
4. Open options.
5. Click **Save + Test API Token**.
6. Refresh Coda.


## Changes in 1.4.2

- Uses the observed Coda fixed shell:
  - `#content-container`
  - `#coda-react-host`
  - `body#coda-body`
  - `#document-root-route`
  - `scroll-container-*`
  - `grid-drop-target-*`
- Push-panel sizing is now computed from each element's left offset and restored on collapse.
- Reply box no longer opens just because a card is active.
- Reply box only opens when Reply is clicked.
- Reply expansion persists across sidebar rerenders until Cancel or Post Reply.
- Active card/highlight state persists across sidebar rerenders.


## Changes in 1.4.3

- Adds direct extension-owned `_Chats` fields:
  - Extension Page URL
  - Extension Anchor Exact Text
  - Extension Anchor Prefix
  - Extension Anchor Suffix
  - Extension Anchor Text Hash
  - Extension Field Label
  - Extension Target Row ID
  - Extension Anchor Status
  - Extension Pending Sync
- Sidebar now reads those direct fields before derived lookup fields.
- New comments appear optimistically in the sidebar immediately.
- Highlight appears immediately using local anchor data.
- Extension still refreshes from Coda in the background.


## Changes in 1.4.4

- Reply textarea no longer loses focus or jumps cursor back to the Coda field.
- Extension UI events no longer trigger Coda selection/comment activation.
- Highlights and cards pulse only on first activation or explicit Locate.
- Clicking the already-active highlight/card keeps active styling without re-pulsing.
- Full chat history appears below the reply field.
- Full chat history is read-only/immutable in the extension UI.
- Replies continue to append into the same `_Chats` row's `Comment Log`.


## Changes in 1.4.5

- Fixes Post Reply button clicks being swallowed by reply-box event protection.
- Adds direct button listeners for Reply / Cancel / Post Reply / Locate / Resolve / Critical / Normal.
- Optimistically appends new replies to the read-only chat history immediately.
- Keeps replies in the same `_Chats` row by appending to `Comment Log`.
- Shows a temporary syncing state while the Coda row update completes.
- Keeps the reply area open after posting and clears the reply textarea.


## Changes in 1.4.6

- Fixes reply typing focus loss by preserving draft text and focused row across sidebar rerenders.
- Adds stronger capture-phase event shielding so Coda keyboard/focus handlers do not steal reply input.
- Reply drafts are restored if the sidebar rerenders while typing.
- Inactive cards no longer show reply boxes or chat history.
- Chat history only shows on the active card.
- Reply box only shows when the active card has Reply expanded.


## Changes in 1.4.7

- Removes the duplicated top title/topic block.
- Moves Stage and Priority to the top of the card.
- Stage and Priority are editable dropdowns using Coda's select-list options.
- Moves Field below Stage/Priority.
- Shows selected text as `Topic`.
- Removes Locate, Critical, and Normal buttons.
- Keeps Resolve as a convenience action.
- Fixes Post Reply so the reply textarea clears back to placeholder text after posting.


## Changes in 1.4.8

- Priority dropdown now uses the requested visual semantics in the extension UI:
  - Critical = red
  - Important = green
  - Normal = light blue
  - Low = gray
- This is UI-only; Coda's stored Priority option text is unchanged.


## Changes in 1.4.9

- Stage dropdown now uses the simplified review workflow:
  - Draft
  - Internal Review
  - External Review
  - Resolved
- Old stage values normalize in the extension:
  - Open -> Internal Review
  - In Review -> Internal Review
  - Closed -> Resolved
  - Stage/blank -> Draft
- New comments and replies default to Internal Review instead of Open/In Review.


## Changes in 1.5.0

- Replaces native Stage/Priority `<select>` elements with extension-owned dropdowns.
- Dropdown menus stay open until the user chooses an option, clicks outside, presses Escape, or opens another dropdown.
- Stage/Priority updates remain optimistic: the card updates immediately while Coda catches up.
- Prevents dropdown clicks from being swallowed by card activation/rerender behavior.


## Changes in 1.5.1

- Dropdown open/close no longer rerenders the card, preventing card jump.
- Stage/Priority optimistic updates preserve the card's top position while the card rerenders.
- Posting a reply preserves the active card's top position; new chat history grows downward.
- Removes the Anchor / Active line from cards.
- Latest now appears directly under Topic and truncates after 100 characters.


## Changes in 1.5.2

- Latest now shows only the latest single comment/reply.
- Latest truncates at 200 characters.
- Latest no longer includes the prior comment to fill space.
- Optimistic replies immediately update Latest because Latest reads from the optimistic Comment Log.
- Active cards no longer use blue shading.
- Active cards now use a thin navy border.
- Full chat history stays at a fixed visible size and scrolls internally once content exceeds that area.


## Changes in 1.5.3

- Adds a stronger reply focus lock while the reply textarea is active.
- Preserves the draft and restores focus if Coda or a sidebar refresh steals focus.
- Treats explicit clicks outside the sidebar as intentional blur.
- Keeps reply focus after posting so the user can continue the thread.


## Changes in 1.6.0

- Adds @mention detection for comments and replies.
- Writes mention metadata into `_Chats`:
  - Mentioned Text
  - Mentioned Emails
  - Mention Notification Status
- Adds native Coda comment mirror fields:
  - Native Coda Thread URI
  - Native Coda Thread URL
  - Native Coda Sync Status
  - Native Coda Last Synced At
  - Native Coda Last Error
- Adds optional Native Coda Comment Bridge URL in extension options.
- If the bridge URL is configured, the extension sends create/reply/resolve payloads to a WGU-approved bridge service.
- If no bridge URL is configured, native sync is marked Disabled and @mentions are marked Fallback Needed.
- The extension does not pretend native Coda notifications were sent unless the bridge confirms sync.


## Changes in 1.6.1

- Fixes Chrome manifest host permission error:
  - Removed invalid `https://*.wgu.edu`
  - Keeps valid `https://*.wgu.edu/*`
  - Adds valid root-domain bridge permission `https://wgu.edu/*`


## Changes in 1.6.2

- Adds visible inline @mention behavior in reply fields.
- Typing `@` opens a mention helper instead of silently doing nothing.
- Typing a name/email after `@` updates the helper.
- Enter/Tab or Use Mention keeps the mention token in the reply.
- Mention detection/storage still happens on submit.
- Native notification still requires a configured WGU Native Coda Comment Bridge.


## Changes in 1.6.3

- Directly uses `_Users GURPS` (`grid--6TaQFCH4e`) as the mention directory.
- Loads active mentionable users from `_Users GURPS`.
- Typing `@keith` now searches name, email, user name, and role acronym.
- Mention picker shows matching people with name, email, role, avatar/initials, and Native/Fallback mode.
- Enter/Tab selects the highlighted user.
- Arrow up/down moves through mention search results.
- Clicking a user inserts `@Display Name`.
- Selected mention metadata contributes the resolved email to `_Chats.Mentioned Emails`.


## Changes in 1.6.4

- Fixes token retrieval regression causing `[WGU Coda Comments] No API token found`.
- Reads the Coda API token from multiple compatible storage keys:
  - apiToken
  - codaApiToken
  - token
  - CODA_API_TOKEN
  - codaToken
  - coda_api_key
  - apiKey
- Repairs storage aliases automatically once a token is found.
- Adds `window.__wguCodaTokenDebug()` for DevTools token-storage diagnostics.


## Changes in 1.6.5

- Hardens Coda API token retrieval across the whole extension.
- `getConfig()` now always returns both `apiToken` and `token`.
- API calls and load guards now check `cfg.apiToken || cfg.token`.
- Repairs token aliases into local/sync storage automatically.
- Keeps `window.__wguCodaTokenDebug()` for DevTools diagnostics.


## Changes in 1.6.7

- Rebuilt from 1.6.5 to avoid the malformed 1.6.6 codaFetch rewrite.
- Fixes JavaScript syntax error from Native Coda status rendering.
- Replaces fragile inline card-status IIFE with precomputed `nativeStatusHtml`.
- Directly patches token compatibility in `getConfig()` and `requireToken()`.
- Prevents `_Users GURPS` mention picker from endless retrying when the API token is unavailable.


## Changes in 1.6.8

- Fixes `_Users GURPS` mention parser for Coda `valueFormat=simple` rows.
- Reads both direct simple values and rich `{ content }` cell values.
- Fixes `Is Active` boolean parsing so active users are not filtered out accidentally.
- Adds explicit loaded-empty state so mention lookup does not reload forever.
- Adds `window.__wguMentionDirectoryDebug()` for DevTools diagnostics.


## Changes in 1.6.9

- Clicking a person in the @mention result list now inserts that mention immediately.
- Removes the redundant `Use Mention` button from the mention helper.
- Adds mousedown protection on picker buttons so Coda does not steal focus before the click is processed.
- Restores reply focus after a mention is selected.


## Changes in 1.7.0

- Fixes mention helper reopening after selecting a person.
- `@Keith Punches ` no longer counts as an active mention query because the caret is after whitespace.
- Adds short suppression after mention insertion so focus/keyup events do not reopen the picker.
- Keeps the selected mention metadata for submit/native bridge sync.
- Notes that native Coda notifications require native comment mirroring; plain stored text does not trigger Coda @mention notifications.


## Changes in 1.7.1

- Adds native bridge contract version `2026-05-12.v1`.
- Sends richer bridge payloads with resolved mention identities from `_Users GURPS`.
- Adds resolved mention chip preview under the reply field.
- Adds native/mention sync status styling.
- Adds `/bridge/BRIDGE_CONTRACT.md`.
- Adds `/bridge/bridge-server-reference.js`.


## Changes in 1.7.2

- Adds fallback mention notification queue support.
- Writes one `_Mention Notification Queue` row per resolved @mention on reply submit.
- Queue table: `grid-RHSxTkVqtL`.
- Adds `/bridge/MENTION_NOTIFICATION_QUEUE.md`.
- Updates bridge contract with spike result: MCP-created native Coda comments did not trigger alert/email.


## Changes in 1.7.3

- Fixes GURPS mention result clicks not populating the reply field.
- Adds delegated event handling for dynamically rendered mention result rows.
- Works for both Native and Fallback mention rows.
- Dispatches input/change after mention insertion so reply draft state updates immediately.


## Changes in 1.7.4

- Cleans up the GURPS mention picker UI:
  - removes instruction header
  - removes Native/Fallback badge
  - removes role text
  - keeps avatar/initials, name, and email
- Removes resolved mention chip preview below reply/comment fields.
- Adds @mention picker support to the initial Add Comment modal.
- Queues mention notifications for initial comments, not just replies.


## Changes in 1.7.5

- Fixes initial Add Comment @mentions not activating `Send Pending Mention Notifications`.
- Stores modal mention selections under a stable initial-comment mention context key.
- Transfers resolved modal mentions to the newly created chat row after the row is created.
- Adds fallback queue resolution using resolved mention tokens/emails if selected identities are missing.
- Adds debug logging for initial mention transfer and queue creation.


## Changes in 1.7.6

- Hardens the content script against Chrome `Extension context invalidated` errors after extension reload/update.
- Stops scheduled refresh callbacks when the old content script instance is invalidated.
- Suppresses noisy invalidated-context errors and logs a clear refresh instruction instead.
- Keeps the 1.7.5 initial-comment @mention notification queue fix.


## Changes in 1.7.7

- Removes visible Native Coda / Mentions diagnostic row from comment cards.
- Removes visible mention pills from comment cards.
- Single-clicking highlighted text now activates/aligns the associated comment card.
- Double-clicking highlighted text temporarily reveals the editable Coda text underneath.
- Adds mousedown/click protection so Coda does not steal focus before the extension handles highlight clicks.


## Changes in 1.7.8

- Adds extension-aware notification deep links.
- Queue `Source Page URL` now includes `wguCommentHash`, `wguChatRowId`, and `wguTargetRowId`.
- When a user opens the notification link, the extension opens the panel and activates/scrolls the exact highlight/comment card.
- Makes Coda page matching ignore extension deep-link query parameters.
- Quiets Chrome `Extension context invalidated` warnings so they do not keep populating the extension error page.


## Changes in 1.7.9

- Reduces highlight mouse-event interference with Coda’s native editor.
- Removes `mousedown.preventDefault()` from highlight anchors so caret/selection hit-testing is not thrown off.
- Allows text selection on highlighted anchors.
- Improves Add Comment field inference:
  - captures nearest visible heading at selection time
  - prefers matching DiscussableFields labels from the heading
  - rejects weak labels like `CU`
  - falls back to the nearest useful heading as a virtual field label


## Changes in 1.8.0

- Adds Coda Notify landing-page router.
- Coda `Notify()` does not expose a redirect/target URL parameter; its wrapper link goes to the page/control that ran the action.
- When the wrapper lands on the notification button/chat page, the extension now:
  - identifies the current Coda user
  - finds the latest recent mention notification row for that user
  - redirects to that row's `Source Page URL`
  - lets the deep-link activator open/align the exact highlight/comment card
- Uses session storage to avoid redirect loops/repeating the same notification route.


## Changes in 1.8.1

- Fixes Resolve not hiding comment cards/highlights.
- Adds resolved-chat filtering to both sidebar cards and page highlights.
- Resolve now optimistically removes the card and associated highlight immediately.
- Resolved rows stay hidden even while Coda backend sync catches up.

## Changes in 1.9.0

- Aligns the extension with the Coda sandbox chat-engine schema on `zR7eW6CJsf`.
- Captures selected text from locked/protected Coda surfaces without trying to edit the source content.
- Stores robust anchor metadata in `_CommentTarget`:
  - Anchor Exact Text
  - Anchor Prefix
  - Anchor Suffix
  - Anchor Text Hash
  - Anchor Status
  - DOM Path Hint
  - Surface Type (`table_cell`, `table_row`, or `canvas_text`)
  - Source Table / row / column hints when they are visible in the DOM
- Creates durable chat rows in `_Chats` with extension-owned anchor fields.
- Fixes the previous invalid `_CommentTarget.Surface Type` value of `field_text`; values now match the table select-list.
- Replaces DOM-wrapping highlights with extension-owned overlay highlights so Coda's React/editor DOM is not reparented or modified.
- Adds range-aware prefix/suffix capture so duplicate text on the same page resolves more reliably.
- Adds paged Coda row reads for `_Chats` and `_CommentTarget` so the sidebar/anchor lookup does not silently stop at the first 100 rows.
- Adds selectionchange handling and user-select CSS to make text selection more reliable in locked/read-only Coda cells.
## 1.9.32 - Word-style anchor rehydration

- Adds support for the new `_Chats.Current Matched Text` column (`c-5SyfvvoFFK`).
- Preserves the original selected quote while writing the live/current resolved text separately.
- Resolves anchors in this order: exact text, prefix/suffix relocated text, fuzzy match, cell/row fallback, orphaned.
- Updates `_Chats.Extension Anchor Status` and `_Chats.Last Anchor Match Confidence` after live anchor resolution.
- Shows original selected text and current relocated match separately on comment cards when text has changed.

## 1.9.34 - Literal Source URL Capture

- Captures exact `window.location.href` at comment creation in Source Browser URL fields.
- Captures normalized full Coda page URL in Source Page URL fields.
- Writes literal HTTPS URLs to avoid Coda smart-reference/page-name link collapsing.
- Keeps existing Extension Page URL behavior but now writes the normalized full page URL there too.


## 1.9.34 - Coda API rate-limit backoff

- Serializes extension Coda API requests so create/comment flows do not burst multiple writes at once.
- Retries temporary 429 and 5xx responses with exponential backoff and Retry-After support.
- Keeps literal source URL capture from 1.9.33.


## 1.9.35 - Compact Word-style comment cards

- Collapses comment cards by default to a Word-style latest-comment preview.
- Adds an expand/collapse control for workflow controls, original/current anchor text, and full history.
- Keeps Reply and Resolve available in the compact state.
- Hides full history until a card is expanded to reduce sidebar DOM weight and visual clutter.
