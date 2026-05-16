# WGU Coda Comment Assistant — Native Coda Comment Bridge Contract

Contract version: `2026-05-12.v1`

The Chrome extension cannot directly call Coda MCP. A WGU-approved server-side bridge receives extension payloads, creates/replies/resolves native Coda comments using Coda MCP or another approved Coda-native comment mechanism, and returns sync metadata.

## Endpoint

`POST https://<approved-wgu-host>/coda/native-comment`

The extension only accepts HTTPS WGU domains.

## Request

```json
{
  "docId": "zR7eW6CJsf",
  "action": "create_thread | add_reply | resolve_thread",
  "content": "@Keith Punches please review this.",
  "fieldLabel": "Student Support Strategy",
  "exact": "selected text",
  "hash": "anchor hash",
  "pageUrl": "https://coda.io/d/...",
  "threadUri": "threads/r-...",
  "mentions": {
    "tokens": ["@Keith Punches"],
    "emails": ["keith.punches@wgu.edu"]
  },
  "mentionIdentities": [
    {
      "rowId": "i-...",
      "displayName": "Keith Punches",
      "email": "keith.punches@wgu.edu",
      "codaPersonId": "28805154",
      "userName": "Keith Punches",
      "roleAcronym": "CodaDev",
      "mentionMode": "native",
      "isWorkspaceMember": true
    }
  ],
  "source": {
    "app": "wgu-coda-comment-assistant",
    "extensionVersion": "1.7.1",
    "bridgeContractVersion": "2026-05-12.v1",
    "url": "https://coda.io/d/..."
  },
  "extensionVersion": "1.7.1",
  "bridgeContractVersion": "2026-05-12.v1",
  "requestedAt": "2026-05-12T00:00:00.000Z"
}
```

## Response

```json
{
  "nativeSyncStatus": "Synced",
  "mentionNotificationStatus": "Native Coda Synced",
  "threadUri": "threads/r-...",
  "threadUrl": "https://coda.io/..."
}
```

If the bridge creates a native comment but cannot verify Coda mention notifications:

```json
{
  "nativeSyncStatus": "Synced",
  "mentionNotificationStatus": "Fallback Needed",
  "threadUri": "threads/r-...",
  "threadUrl": "https://coda.io/...",
  "message": "Native comment created; notification was not verified."
}
```

## Required bridge behavior

- `create_thread`: create a native Coda comment thread.
- `add_reply`: add a native Coda reply to `threadUri`.
- `resolve_thread`: resolve native thread.
- Return `threadUri` for new threads.
- Preserve audit logs server-side.
- Never claim `Native Coda Synced` for mentions unless native notification behavior is verified or intentionally accepted by WGU.

## Current spike result

A native row comment was successfully created by Coda MCP:

- `threadUri`: `threads/r-UysQLQXSqD`
- `commentUri`: `comments/i-BHpITBeChG`

The returned comment body contains `@Keith Punches` as text. Human verification is still required to confirm whether Coda sends native notification/email for MCP-created comments.

## 2026-05-12 spike conclusion

Human verification result: MCP-created native Coda row comments did **not** trigger a Coda alert or email for `@Keith Punches`.

Therefore the extension must treat native Coda comment mirroring as an audit/history mirror only, not as a reliable mention notification channel.

The reliable path is:

1. Resolve mentions from `_Users GURPS`.
2. Write extension comment/reply to `_Chats`.
3. Mirror to native Coda comment thread when bridge is available.
4. Add one row per resolved mention to `_Mention Notification Queue`.
5. WGU-approved automation/service sends email or Teams notification.
6. Automation updates queue row `Status`, `Sent At`, and `Last Error`.
