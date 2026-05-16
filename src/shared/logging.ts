namespace WGU.Logging {
  let debugEnabled = false;
  export function setDebug(enabled: boolean): void { debugEnabled = enabled; }
  export function debug(message: string, data?: unknown): void {
    if (!debugEnabled) return;
    if (data === undefined) console.debug(`[WGU Coda Comments] ${message}`);
    else console.debug(`[WGU Coda Comments] ${message}`, data);
  }
  export function warn(message: string, data?: unknown): void {
    if (data === undefined) console.warn(`[WGU Coda Comments] ${message}`);
    else console.warn(`[WGU Coda Comments] ${message}`, data);
  }
  export function error(message: string, data?: unknown): void {
    if (data === undefined) console.error(`[WGU Coda Comments] ${message}`);
    else console.error(`[WGU Coda Comments] ${message}`, data);
  }
}
