namespace WGU.Anchors.TextMatcher {
  export function normalizeText(value: unknown): string {
    return String(value || "").toLowerCase().replace(/\s+/g, " ").trim();
  }
  export function rareTokens(value: string, limit = 12): string[] {
    const stop = new Set(["the","and","for","with","that","this","from","into","are","was","were","has","have","will","can","not"]);
    return Array.from(new Set(normalizeText(value).split(/[^a-z0-9]+/).filter(t => t.length > 3 && !stop.has(t)))).slice(0, limit);
  }
}
