export const dynamic = "force-dynamic"

import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"

const PLATFORM_STATUSES = new Set(["planned", "submitted", "scheduled_unverified", "live", "excluded", "mapping_issue", "rejected"])
const RELEASE_STATUSES = new Set(["draft", "ready_for_submit", "submitted", "delivered_scheduled", "live", "closed"])

function optionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null
}

function optionalDate(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? undefined : date
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const releases = await prisma.distributionRelease.findMany({
    where: { trackId: params.id },
    orderBy: [{ targetReleaseDate: "desc" }, { createdAt: "desc" }],
    include: { platforms: { orderBy: { platform: "asc" } } },
  })
  return NextResponse.json({ releases })
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await req.json()
    const artistName = optionalString(body.artistName)
    const title = optionalString(body.title)
    const targetReleaseDate = optionalDate(body.targetReleaseDate)
    if (!artistName || !title || targetReleaseDate === undefined) {
      return NextResponse.json({ error: "artistName, title und ein gültiges Release-Datum sind erforderlich." }, { status: 400 })
    }
    if (body.status && !RELEASE_STATUSES.has(body.status)) {
      return NextResponse.json({ error: "Ungültiger Release-Status." }, { status: 400 })
    }
    const track = await prisma.track.findUnique({ where: { id: params.id }, select: { id: true } })
    if (!track) return NextResponse.json({ error: "Track not found" }, { status: 404 })

    const release = await prisma.distributionRelease.create({
      data: {
        trackId: track.id,
        artistName,
        title,
        targetReleaseDate,
        releaseType: optionalString(body.releaseType) ?? "single",
        titleLanguage: optionalString(body.titleLanguage),
        label: optionalString(body.label),
        status: body.status ?? "draft",
        distributor: optionalString(body.distributor) ?? "DistroKid",
        distroKidAlbumUuid: optionalString(body.distroKidAlbumUuid),
        distroKidUrl: optionalString(body.distroKidUrl),
        hyperfollowUrl: optionalString(body.hyperfollowUrl),
        isrc: optionalString(body.isrc),
        upc: optionalString(body.upc),
        submittedMasterPath: optionalString(body.submittedMasterPath),
        submittedCoverPath: optionalString(body.submittedCoverPath),
        releaseFolderPath: optionalString(body.releaseFolderPath),
        platforms: Array.isArray(body.platforms) ? {
          create: body.platforms
            .filter((p: unknown) => p && typeof p === "object" && typeof (p as { platform?: unknown }).platform === "string")
            .map((p: { platform: string; status?: string; url?: string; notes?: string }) => ({
              platform: p.platform.trim(),
              status: PLATFORM_STATUSES.has(p.status ?? "") ? p.status! : "planned",
              url: optionalString(p.url),
              notes: optionalString(p.notes),
            })),
        } : undefined,
      },
      include: { platforms: { orderBy: { platform: "asc" } } },
    })
    return NextResponse.json({ release }, { status: 201 })
  } catch (error) {
    console.error("Create distribution release error:", error)
    return NextResponse.json({ error: "Release konnte nicht erstellt werden." }, { status: 500 })
  }
}
