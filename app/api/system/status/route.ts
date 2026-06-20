import { NextResponse } from "next/server"
import { getSystemStatus } from "@/lib/system-status"

export async function GET() {
  const services = await getSystemStatus()
  return NextResponse.json(
    { services, checkedAt: Date.now() },
    { headers: { "Cache-Control": "no-store" } }
  )
}
