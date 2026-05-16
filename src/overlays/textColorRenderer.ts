namespace WGU.Overlays.TextColorRenderer {
  export function canRender(anchor: WGU.Shared.ResolvedAnchor): boolean { return WGU.Anchors.hasLiveDomTarget(anchor); }
}
