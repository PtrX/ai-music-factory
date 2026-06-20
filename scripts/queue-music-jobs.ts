import { prisma } from "@/lib/db"
import { enqueue } from "@/lib/queue"
import * as fs from "fs/promises"
import * as path from "path"

async function main() {
  const variants = await prisma.variant.findMany({
    where: { status: "prompt_ready", lyricsPath: { not: null }, sunoPromptPath: { not: null } },
    include: { project: true },
  })

  console.log(`Found ${variants.length} prompt_ready variants`)

  for (const v of variants) {
    const existing = await prisma.job.findFirst({ where: { variantId: v.id, type: "music_api" } })
    if (existing) { console.log(`Skip ${v.label}: job already exists (${existing.status})`); continue }

    const lyrics = await fs.readFile(path.join(v.project.folderPath, v.lyricsPath!), "utf-8")
    const pc = await fs.readFile(path.join(v.project.folderPath, v.sunoPromptPath!), "utf-8")
    const neg = pc.match(/^Negative Prompt:\s*(.+)$/im)
    const negativePrompt = neg ? neg[1].trim() : ""
    const stylePrompt = pc.replace(/\n*Negative Prompt:.*$/im, "").trim()

    await enqueue("music_api", v.id, { title: v.project.title, stylePrompt, negativePrompt, lyrics })
    console.log(`✓ Queued music_api for Variant ${v.label} — ${v.project.title}`)
  }

  await prisma.$disconnect()
}

main().catch(console.error)
