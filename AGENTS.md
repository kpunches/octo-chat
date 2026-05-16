# Agent Instructions

## Default behavior

Unless I explicitly say otherwise, operate in review-only mode.

Do not modify GitHub files, Coda docs, Coda pages, Coda tables, Coda rows, Coda columns, comments, controls, or formulas without explicit approval.

## Coda MCP rules

You may use Coda MCP read/search tools to understand docs, pages, tables, rows, and related project context.

Never call destructive Coda tools unless I explicitly approve the exact operation.

Destructive tools include:
- _document_delete
- _page_delete
- _table_rows_delete
- _table_columns_delete
- _table_delete
- _table_view_delete
- _control_delete
- _comment_delete

Before making any Coda write:
1. State the exact tool you plan to call.
2. State the target doc/page/table/row/column.
3. State the intended change.
4. Wait for my approval.

## GitHub/repo rules

Before editing files:
1. Summarize the proposed change.
2. List the files expected to change.
3. Wait for my approval.

Do not commit secrets.
Do not modify extension permissions without explaining why.
Prefer small, reviewable changes.
