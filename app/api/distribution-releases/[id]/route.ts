export const dynamic = "force-dynamic"

import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"

const PLATFORM_STATUSES = new Set(["planned", "submitted", "scheduled_unverified", "live", "excluded", "mapping_issue", "rejected"])
const RELEASE_STATUSES = new Set(["draft", "ready_for_submit", "submitted", "delivered_scheduled", "live", "closed"])

function optionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null
}

function optionalDate(value: unknown) {
  if (value === null || value === "") return null
  if (typeof value !== "string") return undefined
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? undefined : date
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await req.json()
    const dateKeys = ["targetReleaseDate", "submittedAt", "deliveredAt", "liveAt"] as const
    const dates = Object.fromEntries(dateKeys.map(key => [key, optionalDate(body[key])])) as Record<typeof dateKeys[number], Date | null | undefined>
    const existing = await prisma.distributionRelease.findUnique({ where: { id: params.id }, select: { status: true, targetReleaseDate: true } })
    const status = body.status ?? existing?.status
    const targetReleaseDate = body.targetReleaseDate !== undefined ? dates.targetReleaseDate : existing?.targetReleaseDate
    if (!existing || dateKeys.some(key => dates[key] === undefined) || !status || !RELEASE_STATUSES.has(status) || (status !== "draft" && !targetReleaseDate)) {
      return NextResponse.json({ error: "Ungültige Release-Daten." }, { status: 400 })
    }
    const release = await prisma.$transaction(async (tx) => {
      if (Array.isArray(body.platforms)) {
        for (const platform of body.platforms) {
          if (!platform || typeof platform.platform !== "string" || !platform.platform.trim()) continue
          await tx.distributionPlatform.upsert({
            where: { releaseId_platform: { releaseId: params.id, platform: platform.platform.trim() } },
            create: { releaseId: params.id, platform: platform.platform.trim(), status: PLATFORM_STATUSES.has(platform.status) ? platform.status : "planned", url: optionalString(platform.url), notes: optionalString(platform.notes) },
            update: { status: PLATFORM_STATUSES.has(platform.status) ? platform.status : "planned", url: optionalString(platform.url), notes: optionalString(platform.notes), checkedAt: platform.checkedAt ? optionalDate(platform.checkedAt) : undefined },
          })
        }
      }
      return tx.distributionRelease.update({
        where: { id: params.id },
        data: {
          ...(body.artistName !== undefined && optionalString(body.artistName) && { artistName: optionalString(body.artistName)! }),
          ...(body.title !== undefined && optionalString(body.title) && { title: optionalString(body.title)! }),
          ...(body.releaseType !== undefined && { releaseType: optionalString(body.releaseType) ?? "single" }),
          ...(body.titleLanguage !== undefined && { titleLanguage: optionalString(body.titleLanguage) }),
          ...(body.label !== undefined && { label: optionalString(body.label) }),
          ...(body.status !== undefined && { status: body.status }),
          ...(body.distributor !== undefined && { distributor: optionalString(body.distributor) ?? "DistroKid" }),
          ...(body.distroKidAlbumUuid !== undefined && { distroKidAlbumUuid: optionalString(body.distroKidAlbumUuid) }),
          ...(body.distroKidUrl !== undefined && { distroKidUrl: optionalString(body.distroKidUrl) }),
          ...(body.hyperfollowUrl !== undefined && { hyperfollowUrl: optionalString(body.hyperfollowUrl) }),
          ...(body.isrc !== undefined && { isrc: optionalString(body.isrc) }),
          ...(body.upc !== undefined && { upc: optionalString(body.upc) }),
          ...(body.submittedMasterPath !== undefined && { submittedMasterPath: optionalString(body.submittedMasterPath) }),
          ...(body.submittedCoverPath !== undefined && { submittedCoverPath: optionalString(body.submittedCoverPath) }),
          ...(body.releaseFolderPath !== undefined && { releaseFolderPath: optionalString(body.releaseFolderPath) }),
          ...Object.fromEntries(dateKeys.filter(key => body[key] !== undefined).map(key => [key, dates[key]])),
        },
        include: { platforms: { orderBy: { platform: "asc" } } },
      })
    })
    return NextResponse.json({ release })
  } catch (error) {
    console.error("Update distribution release error:", error)
    return NextResponse.json({ error: "Release konnte nicht gespeichert werden." }, { status: 500 })
  }
}
