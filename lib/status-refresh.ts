// Client-side trigger for the StatusBar: fired after credit-consuming actions
// (music generation, AI analysis, render, upload) so credits/connection status
// re-fetch exactly when something was used — instead of on a polling interval.
export const REFRESH_STATUS_EVENT = "amf:refresh-status"

export function refreshSystemStatus(): void {
  if (typeof window === "undefined") return
  window.dispatchEvent(new Event(REFRESH_STATUS_EVENT))
  // Credits are consumed asynchronously by the worker (job pickup + provider
  // submit take a few seconds) — one delayed re-fetch catches the new balance.
  setTimeout(() => window.dispatchEvent(new Event(REFRESH_STATUS_EVENT)), 20_000)
}
