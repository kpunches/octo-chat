namespace WGU.Overlays.Reflow {
  let pending = false;
  export function schedule(fn: () => void): void {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => { pending = false; fn(); });
  }
}
