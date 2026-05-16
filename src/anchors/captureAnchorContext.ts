namespace WGU.Anchors.Capture {
  export interface ApproxGeometry { top: number; left: number; width: number; height: number; pageHeight?: number; viewportHeight?: number; }
  export function geometryFromRange(range: Range, canvasRect?: DOMRect | null): ApproxGeometry {
    const rect = range.getBoundingClientRect();
    const base = canvasRect || document.body.getBoundingClientRect();
    return {
      top: Math.round(rect.top - base.top + (window.scrollY || document.documentElement.scrollTop || 0)),
      left: Math.round(rect.left - base.left + (window.scrollX || document.documentElement.scrollLeft || 0)),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      pageHeight: Math.round(base.height || document.documentElement.scrollHeight || 0),
      viewportHeight: Math.round(window.innerHeight || 0)
    };
  }
}
