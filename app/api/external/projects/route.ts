export const dynamic = "force-dynamic"

import { NextRequest, NextResponse } from "next/server"
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

  const body = await req.json()
  const { title, genre, mood, style, bpm, key: _key, lyrics, variantCount = 2, notifyTelegram = true } = body

  if (!title || !genre || !mood || !style) {
    return NextResponse.json({ error: "title, genre, mood, style required" }, { status: 400 })
  }

  const count = Math.min(Math.max(1, Number.isInteger(variantCount) ? variantCount : 2), 10)

  const parsedBpm = bpm != null ? parseInt(String(bpm), 10) : null
  if (parsedBpm !== null && isNaN(parsedBpm)) {
    return NextResponse.json({ error: "Invalid value for bpm" }, { status: 400 })
  }

  const baseSlug = slugify(title)
  let slug = baseSlug
  let suffix = 1
  while (await prisma.project.findUnique({ where: { slug } })) {
    slug = `${baseSlug}-${suffix++}`
  }
  const folderPath = await ensureProjectFolder(slug)

  const project = await prisma.project.create({
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

  const variants = await Promise.all(
    Array.from({ length: count }, (_, i) => {
      const label = LABELS[i]
      return prisma.variant.create({
        data: {
          projectId: project.id,
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

  if (notifyTelegram) {
    await sendTelegramNotification(
      `🎵 Neues Projekt erstellt: *${title}*\n Genre: ${genre} · ${mood}\n Varianten: ${variantCount}\n[Öffnen](${process.env.NEXT_PUBLIC_APP_URL}/projects/${project.id})`
    )
  }

  return NextResponse.json({ projectId: project.id, variantCount: count, status: "queued" }, { status: 201 })
}
