namespace WGU.Anchors {
  const byThreadId = new Map<string, WGU.Shared.ResolvedAnchor>();
  const byHash = new Map<string, WGU.Shared.ResolvedAnchor>();

  function idsFor(anchor: WGU.Shared.ResolvedAnchor): string[] {
    const ids = Array.isArray(anchor.threadIds) ? anchor.threadIds.slice() : [];
    if (anchor.threadId && !ids.includes(anchor.threadId)) ids.unshift(anchor.threadId);
    return Array.from(new Set(ids.filter(Boolean)));
  }

  export function setAnchor(anchor: WGU.Shared.ResolvedAnchor): void {
    const ids = idsFor(anchor);
    for (const id of ids) byThreadId.set(id, anchor);
    if (anchor.hash) byHash.set(anchor.hash, anchor);
  }

  export function getAnchor(threadId: string): WGU.Shared.ResolvedAnchor | null {
    return byThreadId.get(threadId) || null;
  }

  export function getAnchorByHash(hash: string): WGU.Shared.ResolvedAnchor | null {
    return byHash.get(hash) || null;
  }

  export function deleteAnchor(threadId: string): void { byThreadId.delete(threadId); }
  export function clearAnchors(): void { byThreadId.clear(); byHash.clear(); }
  export function getAllAnchors(): WGU.Shared.ResolvedAnchor[] { return Array.from(new Set([...byThreadId.values(), ...byHash.values()])); }

  export function hasLiveDomTarget(anchor: WGU.Shared.ResolvedAnchor | null): boolean {
    return !!(anchor && (anchor.range || anchor.element || anchor.cell || anchor.blockElement));
  }
}
