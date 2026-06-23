export const dynamic = "force-dynamic"

import { NextRequest, NextResponse } from "next/server"
import * as fs from "fs/promises"
import * as path from "path"
import { prisma } from "@/lib/db"

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { sunoPrompt } = await req.json()
    if (typeof sunoPrompt !== "string") {
      return NextResponse.json({ error: "sunoPrompt must be a string" }, { status: 400 })
    }

    const variant = await prisma.variant.findUnique({
      where: { id: params.id },
      include: { project: true },
    })
    if (!variant) return NextResponse.json({ error: "Variant not found" }, { status: 404 })

    const promptPath = variant.sunoPromptPath ?? `prompts/suno-version-${variant.label.toLowerCase()}.md`
    const fullPath = path.join(variant.project.folderPath, promptPath)
    await fs.mkdir(path.dirname(fullPath), { recursive: true })
    await fs.writeFile(fullPath, sunoPrompt, "utf-8")

    // Extract negativePrompt from the text to keep DB in sync
    const negMatch = sunoPrompt.match(/^Negative Prompt:\s*(.+)$/im)
    const negativePrompt = negMatch ? negMatch[1].trim() : null

    await prisma.variant.update({
      where: { id: params.id },
      data: {
        ...((!variant.sunoPromptPath) && { sunoPromptPath: promptPath }),
        ...(negativePrompt !== null && { negativePrompt }),
      },
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error("Save suno-prompt error:", error)
    return NextResponse.json({ error: "Failed to save prompt" }, { status: 500 })
  }
}
