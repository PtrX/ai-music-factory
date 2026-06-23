import path from "path"
import type { AudioFile } from "@/lib/providers/music/interface"

const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp"])

export function pickProviderCoverUrl(file: AudioFile): string | null {
  return file.providerSourceImageUrl || file.providerImageUrl || null
}

export function coverPathForAudioFile(audioFilename: string, imageUrl: string | null | undefined): string {
  const audioBase = path.basename(audioFilename, path.extname(audioFilename))
  const urlPath = imageUrl ? new URL(imageUrl, "https://placeholder.local").pathname : ""
  const ext = IMAGE_EXTENSIONS.has(path.extname(urlPath).toLowerCase())
    ? path.extname(urlPath).toLowerCase()
    : ".jpg"
  return `outputs/covers/${audioBase}${ext}`
}
