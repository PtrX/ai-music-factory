import { NextRequest } from "next/server"
import { timingSafeEqual } from "crypto"

// Header only — a ?api_key= query fallback would write the long-lived secret
// into reverse-proxy/access logs and browser history.
export function validateExternalApiKey(req: NextRequest): boolean {
  const key = req.headers.get("x-api-key")
  const expected = process.env.EXTERNAL_API_KEY
  if (!expected || !key) return false
  const a = Buffer.from(key)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}
