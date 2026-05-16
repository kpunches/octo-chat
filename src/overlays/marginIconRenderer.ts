namespace WGU.Overlays.MarginIconRenderer {
  export function isSafeIconY(rect: DOMRect): boolean { return rect.top > 76 && rect.bottom > 76; }
}
