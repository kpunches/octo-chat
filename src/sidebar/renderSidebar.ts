namespace WGU.Sidebar.Registry {
  const byThreadId = new Map<string, HTMLElement>();
  export function registerCard(threadId: string, card: HTMLElement): void { if (threadId) byThreadId.set(threadId, card); }
  export function getCard(threadId: string): HTMLElement | null { return byThreadId.get(threadId) || null; }
  export function clearCards(): void { byThreadId.clear(); }
}
