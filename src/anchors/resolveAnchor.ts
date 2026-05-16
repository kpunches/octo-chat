namespace WGU.Anchors.Resolve {
  export function notMounted(threadId: string, reason: string): WGU.Shared.ResolvedAnchor {
    return { threadId, status: "not-mounted", strategy: "none", confidence: 0, lastResolvedAt: Date.now(), failureReason: reason };
  }
}
