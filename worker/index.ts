import * as fs from "fs/promises"
import * as path from "path"
import NodeID3 from "node-id3"
import { prisma } from "@/lib/db"
import { dequeue, enqueue, markDone, markFailed, resetStaleJobs } from "@/lib/queue"
import { getMusicProvider } from "@/lib/providers/music"
import { generateLyrics } from "@/lib/generators/lyrics"
import { generateSunoPrompt, generateCoverPrompt } from "@/lib/generators/suno-prompt"
import { writeFile } from "@/lib/storage"
import { analyzeTrackWithAI } from "@/lib/ai-rating"
import { analyzeAudioLocally } from "@/lib/librosa-analysis"
import { extractLyricsFromAudio, extractLyricsWithTimestamps, extractLyricsGeminiFallback, WhisperSegment } from "@/lib/lyrics-extractor"
import { buildDirectives, generateArtistIdentity } from "@/lib/visual-director"
import { fetchAndCacheSunoCredits } from "@/lib/system-status"
import { findClipForDirective } from "@/lib/clip-library"
import { assembleVideo } from "@/lib/video-assembler"
import { uploadToYouTube, buildYouTubeDescription } from "@/lib/youtube-client"
import { sendTelegramNotification, sendTrackCard } from "@/lib/telegram"

const POLL_INTERVAL = 5000

function toSrtTime(sec: number): string {
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = Math.floor(sec % 60)
  const ms = Math.round((sec % 1) * 1000)
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(ms).padStart(3, "0")}`
}

function buildSrt(segments: WhisperSegment[]): string {
  return segments
    .filter(s => s.text.trim())
    .map((s, i) => `${i + 1}\n${toSrtTime(s.start)} --> ${toSrtTime(s.end)}\n${s.text.trim()}`)
    .join("\n\n")
}

// Auto-queues music_api once both lyricsPath and sunoPromptPath are set on the variant.
// Called after each lyrics/prompt job so whichever finishes last triggers the music step.
async function maybeQueueMusicJob(variantId: string) {
  try {
    const variant = await prisma.variant.findUnique({
      where: { id: variantId },
      include: { project: true },
    })
    if (!variant?.lyricsPath || !variant?.sunoPromptPath) return
    if (!variant.project) return

    const existing = await prisma.job.findFirst({
      where: { variantId, type: "music_api", status: { in: ["pending", "processing", "completed"] } },
    })
    if (existing) return

    const lyricsFullPath = path.join(variant.project.folderPath, variant.lyricsPath)
    const promptFullPath = path.join(variant.project.folderPath, variant.sunoPromptPath)
    const [lyrics, promptContent] = await Promise.all([
      fs.readFile(lyricsFullPath, "utf-8"),
      fs.readFile(promptFullPath, "utf-8"),
    ])

    const negMatch = promptContent.match(/^Negative Prompt:\s*(.+)$/im)
    const negativePrompt = negMatch ? negMatch[1].trim() : ""
    const stylePrompt = promptContent.replace(/\n*Negative Prompt:.*$/im, "").trim()

    await enqueue("music_api", variantId, {
      title: variant.project.title,
      stylePrompt,
      negativePrompt,
      lyrics,
    })
    console.log(`[Worker] Queued music_api for variant ${variant.label} (${variantId})`)
  } catch (e) {
    console.error("[Worker] maybeQueueMusicJob failed (non-fatal):", e)
  }
}

async function handleLyricsJob(job: { id: string; payload: string; variantId: string | null }) {
  // Use the DB-persisted variantId rather than re-parsing from payload
  const variantId = job.variantId
  if (!variantId) throw new Error("Job is missing variantId")

  const input = JSON.parse(job.payload)

  // Validate required payload fields before calling LLM
  if (!input.title || !input.language || !input.genre || !input.mood) {
    throw new Error(`Invalid lyrics job payload: missing required fields (title=${input.title}, language=${input.language}, genre=${input.genre}, mood=${input.mood})`)
  }

  const lyrics = await generateLyrics(input)

  const variant = await prisma.variant.findUnique({
    where: { id: variantId },
    include: { project: true },
  })

  if (!variant) throw new Error(`Variant not found: ${variantId}`)

  const folderPath = variant.project.folderPath
  const variantLabel = (input.variantLabel || variant.label).toLowerCase()
  const lyricsPath = `lyrics/version-${variantLabel}.md`
  await writeFile(folderPath, lyricsPath, lyrics)

  await prisma.variant.update({
    where: { id: variant.id },
    data: {
      lyricsPath,
      status: "prompt_ready",
    },
  })

  await markDone(job.id, { lyricsPath })
}

async function handlePromptJob(job: { id: string; payload: string; variantId: string | null }) {
  const variantId = job.variantId
  if (!variantId) throw new Error("Prompt job is missing variantId")

  const input = JSON.parse(job.payload)

  if (input.type === "cover") {
    const project = await prisma.project.findUnique({
      where: { id: input.projectId },
    })

    if (!project) throw new Error(`Project not found: ${input.projectId}`)

    const prompt = await generateCoverPrompt({
      title: input.title,
      genre: input.genre,
      mood: input.mood,
      vibe: input.vibe,
    })

    await writeFile(project.folderPath, "prompts/cover-prompt.md", prompt)
    await markDone(job.id, { type: "cover" })
    return
  }

  const { stylePrompt, negativePrompt } = await generateSunoPrompt(input)

  const variant = await prisma.variant.findUnique({
    where: { id: variantId },
    include: { project: true },
  })

  if (!variant) throw new Error("Variant not found")

  const folderPath = variant.project.folderPath
  const promptPath = `prompts/suno-version-${input.variantLabel.toLowerCase()}.md`
  const promptContent = `${stylePrompt}\n\nNegative Prompt: ${negativePrompt}`
  await writeFile(folderPath, promptPath, promptContent)

  await prisma.variant.update({
    where: { id: variant.id },
    data: {
      sunoPromptPath: promptPath,
      negativePrompt,
      status: "prompt_ready",
    },
  })

  await markDone(job.id, { promptPath })
}

async function handleMusicJob(job: { id: string; payload: string; variantId: string | null }) {
  // Use the DB-persisted variantId (bug #28)
  const variantId = job.variantId
  if (!variantId) throw new Error("Music job is missing variantId")

  const input = JSON.parse(job.payload)

  // Pre-flight: verify variant exists and prerequisite steps completed (bug #27)
  const variantCheck = await prisma.variant.findUnique({
    where: { id: variantId },
    include: { project: true },
  })
  if (!variantCheck) throw new Error(`Variant not found: ${variantId}`)
  if (!variantCheck.sunoPromptPath || !variantCheck.lyricsPath) {
    throw new Error(`Variant ${variantId} is missing sunoPromptPath or lyricsPath — prerequisite steps not complete`)
  }

  const provider = getMusicProvider()

  // Reuse existing Suno taskId on retry so we don't burn credits re-submitting
  let jobId: string = input.sunoTaskId || ""
  if (!jobId) {
    const result = await provider.createSong({
      title: input.title,
      stylePrompt: input.stylePrompt,
      negativePrompt: input.negativePrompt,
      lyrics: input.lyrics,
    })
    jobId = result.jobId
    // Persist the Suno taskId so retries poll instead of re-submit
    await prisma.job.update({
      where: { id: job.id },
      data: { payload: JSON.stringify({ ...input, sunoTaskId: jobId }) },
    })
  }

  await prisma.variant.update({
    where: { id: variantId },
    data: { status: "generating" },
  })

  // Unified polling loop — sunoapi.org needs up to 15 minutes under load
  const maxAttempts = 180
  let status = { status: "pending" }
  for (let i = 0; i < maxAttempts; i++) {
    status = await provider.getStatus(jobId)
    if (status.status === "completed") break
    if (status.status === "failed") {
      throw new Error("Music generation failed")
    }
    await new Promise((resolve) => setTimeout(resolve, 5000))
  }

  if (status.status !== "completed") {
    throw new Error("Music generation timed out")
  }

  const files = await provider.downloadResult(jobId)

  // Re-fetch to get folderPath (already validated above, but refreshed after possible updates)
  const variant = await prisma.variant.findUnique({
    where: { id: variantId },
    include: { project: true },
  })
  if (!variant) throw new Error(`Variant not found after generation: ${variantId}`)

  // Save all tracks, create Track records, run AI rating
  const existingNames = new Set(
    (await prisma.track.findMany({ where: { variantId }, select: { versionName: true } }))
      .map(t => t.versionName).filter(Boolean) as string[]
  )
  const usedNamesThisBatch = new Set<string>()

  function uniqueVersionName(suggested: string | null | undefined): string | null {
    if (!suggested) return null
    const ROMAN = ["", " II", " III", " IV", " V", " VI"]
    for (let n = 0; n < ROMAN.length; n++) {
      const candidate = suggested + ROMAN[n]
      if (!existingNames.has(candidate) && !usedNamesThisBatch.has(candidate)) {
        usedNamesThisBatch.add(candidate)
        existingNames.add(candidate)
        return candidate
      }
    }
    return suggested
  }

  let primaryAudioPath: string | null = null
  for (let i = 0; i < files.length; i++) {
    const file = files[i]
    const audioPath = `outputs/audio/${file.filename}`

    let buffer = file.buffer
    if (!buffer && file.url) {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 120_000)
      try {
        const audioRes = await fetch(file.url, { signal: controller.signal })
        if (!audioRes.ok) throw new Error(`Failed to download audio from ${file.url}: ${audioRes.status}`)
        buffer = Buffer.from(await audioRes.arrayBuffer())
      } finally {
        clearTimeout(timeout)
      }
    }

    if (buffer) {
      await writeFile(variant.project.folderPath, audioPath, buffer)

      const fullAudioPath = path.join(variant.project.folderPath, audioPath)
      const versionName = variant.versionName || variant.name
      NodeID3.write({
        title: `${variant.project.title} (${versionName} v${i + 1})`,
        genre: variant.project.genre,
        comment: { language: "eng", text: input.stylePrompt?.slice(0, 200) || "" },
        bpm: variant.project.bpm ? String(variant.project.bpm) : undefined,
        trackNumber: String(i + 1),
        textWriter: variant.project.poemAuthor || undefined,
        userDefinedText: [
          { description: "Language", value: variant.project.language },
          { description: "Mood", value: variant.project.mood },
          { description: "Variant", value: variant.label },
          ...(variant.project.poemTitle ? [{ description: "PoemTitle", value: variant.project.poemTitle }] : []),
          ...(variant.project.poemAuthor ? [{ description: "PoemAuthor", value: variant.project.poemAuthor }] : []),
        ],
      }, fullAudioPath)

      // Step 1: local librosa (precise timestamps, BPM, key)
      console.log(`[Worker] Running librosa analysis for track ${i + 1}...`)
      const librosaData = await analyzeAudioLocally(fullAudioPath)
      if (librosaData) {
        // Update ID3 BPM with accurate librosa value
        NodeID3.write({ bpm: String(Math.round(librosaData.bpm)) }, fullAudioPath)
      }

      // Step 2: Gemini (labels + scores, timestamps locked from librosa)
      console.log(`[Worker] Running Gemini analysis for track ${i + 1}...`)
      const analysis = await analyzeTrackWithAI(
        fullAudioPath,
        { genre: variant.project.genre, mood: variant.project.mood, style: input.stylePrompt?.slice(0, 100) },
        librosaData
      )

      await prisma.track.create({
        data: {
          variantId: variant.id,
          index: i,
          audioPath,
          aiScoreHook: analysis?.scores?.scoreHook ?? null,
          aiScoreVocal: analysis?.scores?.scoreVocal ?? null,
          aiScoreBeat: analysis?.scores?.scoreBeat ?? null,
          aiScoreEmotion: analysis?.scores?.scoreEmotion ?? null,
          aiScoreRemix: analysis?.scores?.scoreRemix ?? null,
          aiScoreTikTok: analysis?.scores?.scoreTikTok ?? null,
          aiScoreTotal: analysis?.scores?.scoreTotal ?? null,
          aiNotes: analysis?.scores?.notes ?? null,
          structureJson: analysis?.structure ? JSON.stringify(analysis.structure) : null,
          suggestedVersionName: analysis?.structure?.suggestedVersionName ?? null,
          versionName: uniqueVersionName(analysis?.structure?.suggestedVersionName),
        },
      })

      if (analysis) {
        console.log(`[Worker] AI analysis track ${i + 1}: score=${analysis.scores?.scoreTotal}, sections=${analysis.structure?.sections?.length}, name="${analysis.structure?.suggestedVersionName}"`)
      }
    }

    if (i === 0) primaryAudioPath = audioPath
  }

  await prisma.variant.update({
    where: { id: variant.id },
    data: {
      audioPath: primaryAudioPath,
      status: "completed",
    },
  })

  await markDone(job.id, { files: files.map((f) => f.filename) })

  // Cache remaining Suno credits after successful generation
  fetchAndCacheSunoCredits().catch(() => {})

  // Notify Telegram — one card per new track
  const newTracks = await prisma.track.findMany({
    where: { variantId: variant.id },
    orderBy: { createdAt: "desc" },
    take: files.length,
  })
  for (const track of newTracks) {
    await sendTrackCard({
      trackId:      track.id,
      trackIndex:   track.index,
      versionName:  track.versionName,
      audioPath:    track.audioPath,
      projectTitle: variant.project.title,
      variantLabel: variant.label,
      scoreTotal:   track.aiScoreTotal,
      scoreHook:    track.aiScoreHook,
      scoreVocal:   track.aiScoreVocal,
      scoreBeat:    track.aiScoreBeat,
      aiNotes:      track.aiNotes,
    })
  }

  // If all variants of this project are completed, mark project as completed too
  const allVariants = await prisma.variant.findMany({ where: { projectId: variant.project.id } })
  if (allVariants.every((v) => v.status === "completed")) {
    await prisma.project.update({
      where: { id: variant.project.id },
      data: { status: "completed" },
    })
  }
}

async function handleAnalyzeImportedTrack(job: { id: string; payload: string; variantId: string | null }) {
  const payload = JSON.parse(job.payload) as {
    trackId: string
    variantId: string
    filePath: string
    lyricsMode: "id3" | "ai" | "manual" | "instrumental"
  }

  const { trackId, variantId, filePath, lyricsMode } = payload

  const variant = await prisma.variant.findUnique({
    where: { id: variantId },
    include: { project: true },
  })
  if (!variant) throw new Error(`Variant not found: ${variantId}`)

  await prisma.variant.update({
    where: { id: variantId },
    data: { status: "analyzing" },
  })

  const librosaData = await analyzeAudioLocally(filePath)
  if (!librosaData) {
    console.warn(`[Worker] Librosa failed for ${filePath}, continuing without`)
  }

  const aiResult = await analyzeTrackWithAI(
    filePath,
    {
      genre: variant.project.genre || undefined,
      mood: variant.project.mood || undefined,
    },
    librosaData ?? undefined
  )

  let lyricsPath: string | null = variant.lyricsPath
  let srtPath: string | null = null
  if (lyricsMode === "ai") {
    const whisperResult = await extractLyricsWithTimestamps(filePath)
    if (whisperResult) {
      // Save plain lyrics
      const lyricsFilename = `${variantId}-lyrics.txt`
      await fs.writeFile(path.join(variant.project.folderPath, lyricsFilename), whisperResult.lyrics, "utf-8")
      lyricsPath = lyricsFilename
      // Save SRT with timestamps if Whisper returned segments
      if (whisperResult.segments.length > 0) {
        const srtContent = buildSrt(whisperResult.segments)
        const srtFilename = `${variantId}-lyrics.srt`
        await fs.writeFile(path.join(variant.project.folderPath, srtFilename), srtContent, "utf-8")
        srtPath = srtFilename
        console.log(`[Worker] SRT saved: ${srtFilename} (${whisperResult.segments.length} segments)`)
      }
    } else if (whisperResult === undefined) {
      // Whisper failed — Gemini fallback (no timestamps, no SRT)
      console.warn("[Worker] Whisper failed — falling back to Gemini (no SRT available)")
      const lyrics = await extractLyricsGeminiFallback(filePath)
      if (lyrics) {
        const lyricsFilename = `${variantId}-lyrics.txt`
        await fs.writeFile(path.join(variant.project.folderPath, lyricsFilename), lyrics, "utf-8")
        lyricsPath = lyricsFilename
      }
    }
  }

  const scores = aiResult?.scores
  const structure = aiResult?.structure
  await prisma.track.update({
    where: { id: trackId },
    data: {
      aiScoreHook: scores?.scoreHook ?? null,
      aiScoreVocal: scores?.scoreVocal ?? null,
      aiScoreBeat: scores?.scoreBeat ?? null,
      aiScoreEmotion: scores?.scoreEmotion ?? null,
      aiScoreRemix: scores?.scoreRemix ?? null,
      aiScoreTikTok: scores?.scoreTikTok ?? null,
      aiScoreTotal: scores?.scoreTotal ?? null,
      aiNotes: scores?.notes ?? null,
      structureJson: structure ? JSON.stringify(structure) : null,
      suggestedVersionName: structure?.suggestedVersionName ?? null,
      versionName: await (async () => {
        const suggested = structure?.suggestedVersionName
        if (!suggested) return null
        const others = new Set(
          (await prisma.track.findMany({ where: { variantId, id: { not: trackId } }, select: { versionName: true } }))
            .map(t => t.versionName).filter(Boolean) as string[]
        )
        const ROMAN = ["", " II", " III", " IV", " V", " VI"]
        for (const suffix of ROMAN) {
          const candidate = suggested + suffix
          if (!others.has(candidate)) return candidate
        }
        return suggested
      })(),
      ...(srtPath ? { srtPath } : {}),
    },
  })

  await prisma.variant.update({
    where: { id: variantId },
    data: {
      status: "completed",
      lyricsPath,
      scoreHook: scores?.scoreHook ?? null,
      scoreVocal: scores?.scoreVocal ?? null,
      scoreBeat: scores?.scoreBeat ?? null,
      scoreEmotion: scores?.scoreEmotion ?? null,
      scoreRemix: scores?.scoreRemix ?? null,
      scoreTikTok: scores?.scoreTikTok ?? null,
      scoreTotal: scores?.scoreTotal ?? null,
      notes: scores?.notes ?? null,
      versionName: structure?.suggestedVersionName ?? null,
    },
  })

  if (librosaData && !variant.project.bpm && librosaData.bpm) {
    await prisma.project.update({
      where: { id: variant.project.id },
      data: { bpm: Math.round(librosaData.bpm) },
    })
  }

  // If all variants of this project are completed, mark project as completed too
  const allVariants = await prisma.variant.findMany({ where: { projectId: variant.project.id } })
  if (allVariants.every((v) => v.status === "completed")) {
    await prisma.project.update({
      where: { id: variant.project.id },
      data: { status: "completed" },
    })
  }

  await markDone(job.id, { trackId, variantId })
  console.log(`[Worker] analyze_imported_track done for variant ${variantId}`)
}

async function handleVideoRenderJob(job: { id: string; payload: string; variantId: string | null }) {
  const { trackId, visualTrack, videoJobId } = JSON.parse(job.payload)

  await prisma.videoJob.update({ where: { id: videoJobId }, data: { status: "rendering" } })

  const track = await prisma.track.findUnique({
    where: { id: trackId },
    include: { variant: { include: { project: { include: { artistIdentity: true } } } } },
  })
  if (!track) throw new Error("Track not found")
  if (!track.structureJson) throw new Error("Track has no Song DNA — run KI-Analyse first")

  const structure = JSON.parse(track.structureJson)
  const project = track.variant.project

  const aiScoresHigh = (track.aiScoreTotal ?? 0) >= 6
  const userScoresHigh = (track.scoreTotal ?? 0) >= 6
  if (!aiScoresHigh && !userScoresHigh) throw new Error("Track quality below threshold — min scoreTotal >= 6 required")

  const identity = project.artistIdentity ?? await generateArtistIdentity(project, structure)

  const identityData = {
    colorPrimary: identity.colorPrimary,
    colorAccent: identity.colorAccent,
    signatureMotif: identity.signatureMotif,
    visualTrack: identity.visualTrack,
  }

  const directives = buildDirectives(structure, identityData, project.genre)

  const clips = new Map<number, import("@/lib/clip-library").ClipResult>()
  for (let i = 0; i < directives.length; i++) {
    const clip = await findClipForDirective(directives[i], project.id)
    if (clip) clips.set(i, clip)
  }

  const outputPath = `outputs/videos/${track.id}-video.mp4`
  const fullOutputPath = path.join(project.folderPath, outputPath)
  await assembleVideo({
    audioPath: path.join(project.folderPath, track.audioPath),
    directives,
    clips,
    identity: identityData,
    outputPath: fullOutputPath,
    title: `${project.title} — ${track.versionName || "Mix"}`,
  })

  await prisma.videoJob.update({
    where: { id: videoJobId },
    data: { status: "done", outputPath },
  })

  await sendTelegramNotification(
    `🎬 Video fertig: *${project.title}*\n` +
    `[Preview + Freigabe](${process.env.NEXT_PUBLIC_APP_URL}/projects/${project.id})`
  )
}

async function handleYoutubeUploadJob(job: { id: string; payload: string; variantId: string | null }) {
  const { videoJobId } = JSON.parse(job.payload)

  const videoJob = await prisma.videoJob.findUnique({
    where: { id: videoJobId },
    include: { track: { include: { variant: { include: { project: true } } } } },
  })
  if (!videoJob?.outputPath) throw new Error("No rendered video found")

  const track = videoJob.track
  const project = track.variant.project
  const structure = track.structureJson ? JSON.parse(track.structureJson) : null

  let sunoStyle = ""
  if (track.variant.sunoPromptPath) {
    try {
      sunoStyle = (await fs.readFile(path.join(project.folderPath, track.variant.sunoPromptPath), "utf-8")).slice(0, 200)
    } catch {
      // ignore
    }
  }

  await prisma.videoJob.update({ where: { id: videoJobId }, data: { status: "uploading" } })

  const description = structure
    ? buildYouTubeDescription(structure, sunoStyle)
    : sunoStyle || "Produced with AI Music Factory"

  const { videoId, url } = await uploadToYouTube({
    videoPath: path.join(project.folderPath, videoJob.outputPath),
    title: `${project.title} — ${track.versionName || "Mix"}`,
    description,
    tags: [project.genre, project.mood, "AI Music"],
  })

  await prisma.videoJob.update({
    where: { id: videoJobId },
    data: { status: "done", youtubeVideoId: videoId, youtubeUrl: url },
  })
}

async function processJob() {
  let job = null
  try {
    job = await dequeue()
  } catch (e) {
    console.error("[Worker] Dequeue error:", e)
    return
  }
  if (!job) return

  try {
    console.log(`[Worker] Processing job ${job.id}: ${job.type}`)

    switch (job.type) {
      case "generate_lyrics":
        await handleLyricsJob(job)
        break
      case "generate_prompt":
        await handlePromptJob(job)
        break
      case "music_api":
        await handleMusicJob(job)
        break
      case "analyze_imported_track":
        await handleAnalyzeImportedTrack(job)
        break
      case "video_render":
        await handleVideoRenderJob(job)
        break
      case "youtube_upload":
        await handleYoutubeUploadJob(job)
        break
      default:
        console.error(`[Worker] Unknown job type: ${job.type}`)
        await markFailed(job.id, `Unknown job type: ${job.type}`)
    }

    console.log(`[Worker] Job ${job.id} completed`)
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error"
    console.error(`[Worker] Job ${job.id} failed:`, message)
    await markFailed(job.id, message)
  }
}

async function main() {
  console.log("[Worker] Starting AI Music Factory worker...")

  await resetStaleJobs()

  let shuttingDown = false

  const loop = async () => {
    if (shuttingDown) return
    try {
      await processJob()
    } catch (e) {
      console.error("[Worker] Poll loop error:", e)
    }
    if (!shuttingDown) setTimeout(loop, POLL_INTERVAL)
  }
  loop()

  process.on("SIGINT", () => {
    console.log("[Worker] Shutting down gracefully...")
    shuttingDown = true
    setTimeout(() => process.exit(0), 10_000)
  })

  process.on("SIGTERM", () => {
    console.log("[Worker] Shutting down gracefully...")
    shuttingDown = true
    setTimeout(() => process.exit(0), 10_000)
  })
}

main().catch(console.error)
