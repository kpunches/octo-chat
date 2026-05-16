namespace WGU.Anchors.DomRangeFinder {
  export function isElementVisible(el: Element): boolean {
    const r = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && style.display !== "none" && style.visibility !== "hidden";
  }
}
