# _Mention Notification Queue

Table ID: `grid-RHSxTkVqtL`

The extension writes one row per resolved @mention. This table is the durable queue for WGU-approved notification delivery.

## Columns

- Notification ID: `c-dmJPq5XQXM`
- Status: `c-Lm8C4f905b`
- Mentioned Name: `c-LMqAZ3cfaq`
- Mentioned Email: `c-Y3XLWXsjTP`
- Mentioned Coda Person ID: `c-s7vIIA33jr`
- Mention Text: `c-Sxm1upIs_C`
- Comment Content: `c-qmjTlf97FM`
- Sender Name: `c-hW152eq8qH`
- Sender Email: `c-Ne-Z6alZEw`
- Chat Row ID: `c-W-LX_dvyUP`
- Target Row ID: `c-YAequBO8xl`
- Source Field: `c-lEusbisZ6O`
- Source Page URL: `c-dvBNcwwxYJ`
- Native Thread URI: `c-gejhXHLrO0`
- Native Thread URL: `c-cjQ6bg-D8-`
- Created At: `c-FBrsXERLqm`
- Sent At: `c-2VuUKRDGV5`
- Last Error: `c-gdSVuQdFnm`

## Automation contract

A WGU-approved automation/service should:

1. Poll rows where `Status = Pending`.
2. Send email/Teams notification to `Mentioned Email`.
3. Include source URL, source field, comment content, and sender.
4. Set `Status = Sent`, `Sent At = Now()`.
5. On failure, set `Status = Failed` and write `Last Error`.

Native Coda alerts/emails are not reliable for MCP/API-created comments based on sandbox testing.
