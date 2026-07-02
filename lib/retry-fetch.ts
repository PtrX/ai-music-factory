export async function fetchWithRetry(
  url: string,
  options: RequestInit,
  retries = 2,
  baseDelayMs = 1000
): Promise<Response> {
  let lastError: Error | null = null
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(url, options)
      if (res.ok || i === retries) return res
      if (res.status === 429 || res.status >= 500) {
        lastError = new Error(`HTTP ${res.status}`)
        // Undici keeps the connection reserved until the body is consumed or
        // cancelled — abandoned retry bodies would pin sockets in the pool.
        await res.body?.cancel().catch(() => {})
        await new Promise(r => setTimeout(r, baseDelayMs * Math.pow(2, i)))
        continue
      }
      return res
    } catch (err) {
      lastError = err instanceof Error ? err : new Error("Unknown fetch error")
      if (i < retries) {
        await new Promise(r => setTimeout(r, baseDelayMs * Math.pow(2, i)))
      }
    }
  }
  throw lastError || new Error("Fetch failed after retries")
}
