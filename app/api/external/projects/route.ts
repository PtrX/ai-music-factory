export const dynamic = "force-dynamic"

import { NextRequest, NextResponse } from "next/server"
import { Prisma, type Project } from "@prisma/client"
import { prisma } from "@/lib/db"
import { validateExternalApiKey } from "@/lib/external-auth"
import { enqueue } from "@/lib/queue"
import { sendTelegramNotification } from "@/lib/telegram"
import { slugify, ensureProjectFolder, writeFile } from "@/lib/storage"

const LABELS = ["A", "B", "C", "D", "E"]
const VARIANT_NAMES: Record<string, string> = {
  A: "Emotional & Cinematic",
  B: "Club & Dance",
  C: "Organic & Poetic",
  D: "Dark & Hypnotic",
  E: "Radio / TikTok",
}

export async function POST(req: NextRequest) {
  if (!validateExternalApiKey(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let body
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }
  const { title, genre, mood, style, bpm, key: _key, lyrics, variantCount = 2, notifyTelegram = true } = body

  if (!title || !genre || !mood || !style) {
    return NextResponse.json({ error: "title, genre, mood, style required" }, { status: 400 })
  }

  // Clamp to the labels that actually exist — LABELS[5..9] would be undefined
  // and crash variant creation (matches the internal route's clamp of 5)
  const count = Math.min(Math.max(1, Number.isInteger(variantCount) ? variantCount : 2), LABELS.length)

  const parsedBpm = bpm != null ? parseInt(String(bpm), 10) : null
  if (parsedBpm !== null && isNaN(parsedBpm)) {
    return NextResponse.json({ error: "Invalid value for bpm" }, { status: 400 })
  }

  const baseSlug = slugify(title)
  let slug = baseSlug
  let folderPath = ""
  let project: Project | null = null
  // Everything from here on can partially succeed (project row created, some
  // jobs enqueued) — return a structured error including projectId so the
  // caller (hermes) can reconcile instead of blind-retrying into duplicates.
  try {
  for (let suffix = 0; suffix < 50; suffix++) {
    slug = suffix === 0 ? baseSlug : `${baseSlug}-${suffix}`
    folderPath = await ensureProjectFolder(slug)
    try {
      project = await prisma.project.create({
        data: {
          slug,
          title,
          language: body.language || "english",
          genre,
          mood,
          vibe: style,
          bpm: parsedBpm,
          variantCount: count,
          folderPath,
          source: "hermes",
        },
      })
      break
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") continue
      throw error
    }
  }
  if (!project) {
    return NextResponse.json({ error: "Could not create a unique project slug" }, { status: 409 })
  }
  const created = project

  const variants = await Promise.all(
    Array.from({ length: count }, (_, i) => {
      const label = LABELS[i]
      return prisma.variant.create({
        data: {
          projectId: created.id,
          label,
          name: VARIANT_NAMES[label] || `Variant ${label}`,
        },
      })
    })
  )

  const jobs = []

  for (const variant of variants) {
    if (!lyrics) {
      jobs.push(
        enqueue("generate_lyrics", variant.id, {
          projectId: project.id,
          variantId: variant.id,
          title: project.title,
          language: project.language,
          genre: project.genre,
          mood: project.mood,
          vibe: project.vibe,
          bpm: project.bpm,
          vocalType: project.vocalType,
          variantLabel: variant.label,
        })
      )
    } else {
      const lyricsPath = `lyrics/version-${variant.label.toLowerCase()}.md`
      await writeFile(folderPath, lyricsPath, lyrics)
      await prisma.variant.update({ where: { id: variant.id }, data: { lyricsPath } })
    }

    jobs.push(
      enqueue("generate_prompt", variant.id, {
        projectId: project.id,
        variantId: variant.id,
        title: project.title,
        genre: project.genre,
        mood: project.mood,
        vibe: project.vibe,
        bpm: project.bpm,
        vocalType: project.vocalType,
        variantLabel: variant.label,
      })
    )
  }

  await Promise.all(jobs)
  } catch (error) {
    console.error("Create external project error:", error)
    return NextResponse.json(
      { error: "Internal error", projectId: project?.id ?? null },
      { status: 500 }
    )
  }

  if (notifyTelegram) {
    // Best-effort — a Telegram outage must not fail an otherwise-successful creation
    await sendTelegramNotification(
      `🎵 Neues Projekt erstellt: *${title}*\n Genre: ${genre} · ${mood}\n Varianten: ${count}\n[Öffnen](${process.env.NEXT_PUBLIC_APP_URL}/projects/${project.id})`
    ).catch((e) => console.error("Telegram notification failed:", e))
  }

  return NextResponse.json({ projectId: project.id, variantCount: count, status: "queued" }, { status: 201 })
}
