namespace WGU.Ids {
  export function stableId(prefix = "wgu"): string {
    const rand = Math.random().toString(36).slice(2, 10);
    return `${prefix}_${Date.now().toString(36)}_${rand}`;
  }
  export function normalizeId(value: unknown): string { return String(value || "").trim(); }
}
