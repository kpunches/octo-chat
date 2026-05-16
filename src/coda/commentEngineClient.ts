namespace WGU.Coda.CommentEngineClient {
  export function tableRowsUrl(docId: string, tableId: string): string {
    return `https://coda.io/apis/v1/docs/${encodeURIComponent(docId)}/tables/${encodeURIComponent(tableId)}/rows`;
  }
  export function threadProjection(): string[] {
    const c = WGU.Config.COMMENT_ENGINE_SCHEMA.threads.columns;
    return [c.threadId, c.sourceDocId, c.sourcePageUrl, c.sourcePageName, c.resolved, c.anchorExactText, c.anchorPrefix, c.anchorSuffix, c.anchorTextHash, c.lastMessagePreview, c.lastMessageAt, c.lastMessageAuthorInitials, c.messageCount, c.approxTop, c.approxPageHeight];
  }
}
