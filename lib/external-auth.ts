import { NextRequest } from "next/server"

export function validateExternalApiKey(req: NextRequest): boolean {
  const key = req.headers.get("x-api-key") ?? req.nextUrl.searchParams.get("api_key")
  const expected = process.env.EXTERNAL_API_KEY
  if (!expected) return false
  return key === expected
}
