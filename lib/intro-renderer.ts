import * as fs from "fs/promises"
import * as os from "os"
import * as path from "path"
import { execSync } from "child_process"

export const INTRO_CREDIT = "AI Music Factory by PTRX"
export const INTRO_RENDER_TIMEOUT_MS = 120_000

export interface IntroRenderInput {
  title: string
  version: string
  accentColor: string
  backgroundClipPath: string
  introDurationSec: number
  outputPath: string
}

// Python script (written to tmp) that generates the text+scrim overlay PNG via PIL.
// PIL handles Unicode (Cyrillic etc.) and doesn't need ffmpeg drawtext/freetype.
function buildOverlayScript(params: {
  title: string
  version: string
  credit: string
  accent: string   // 6-char hex without #
  outPath: string
}): string {
  const { title, version, credit, accent, outPath } = params
  // JSON-encode strings so Python receives valid UTF-8 without shell escaping hell
  const data = JSON.stringify({ title, version, credit, accent, out: outPath })
  return `
import sys, json
from PIL import Image, ImageDraw, ImageFont

d = json.loads(${JSON.stringify(data)})
title, version, credit, out = d['title'], d['version'], d['credit'], d['out']
accent = tuple(int(d['accent'][i:i+2], 16) for i in (0, 2, 4))

W, H = 1920, 1080
img = Image.new('RGBA', (W, H), (0, 0, 0, 0))
draw = ImageDraw.Draw(img)

# Scrim: dark semi-transparent band at lower third
draw.rectangle([0, 650, W, H], fill=(13, 20, 20, 160))

# Font loader — tries macOS, then common Debian paths, then built-in fallback
def font(size):
    candidates = [
        '/System/Library/Fonts/Helvetica.ttc',
        '/System/Library/Fonts/SFNSDisplay.ttf',
        '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
        '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf',
        '/usr/share/fonts/truetype/freefont/FreeSansBold.ttf',
    ]
    for p in candidates:
        try:
            return ImageFont.truetype(p, size)
        except Exception:
            pass
    return ImageFont.load_default()

ft_title   = font(72)
ft_version = font(44)
ft_credit  = font(22)

# Title — white, bold
draw.text((110, H - 250), title,   font=ft_title,   fill=(255, 255, 255, 255))
# Version — accent colour
draw.text((110, H - 162), version, font=ft_version, fill=(*accent, 255))
# Credit — dimmed white
draw.text((110, H - 105), credit,  font=ft_credit,  fill=(255, 255, 255, 140))

img.save(out)
`
}

export async function renderIntro(input: IntroRenderInput): Promise<string> {
  const { title, version, accentColor, backgroundClipPath, introDurationSec, outputPath } = input

  // All work in local /tmp — NFS latency on NAS mount kills ffmpeg and Puppeteer
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "hf-intro-"))

  try {
    const dur = Math.max(3, Math.min(introDurationSec, 10))
    const accent = (accentColor.startsWith("#") ? accentColor.slice(1) : accentColor) || "1db954"

    // 1. Generate overlay PNG with Python PIL
    const overlayPng = path.join(tmpDir, "overlay.png")
    const pyFile     = path.join(tmpDir, "overlay.py")
    await fs.writeFile(pyFile, buildOverlayScript({
      title, version, credit: INTRO_CREDIT, accent, outPath: overlayPng,
    }))
    execSync(`python3 "${pyFile}"`, { stdio: "pipe" })

    // 2. Copy source clip to local tmp to avoid NFS read latency
    const srcLocal = path.join(tmpDir, "src.mp4")
    await fs.copyFile(backgroundClipPath, srcLocal)

    await fs.mkdir(path.dirname(outputPath), { recursive: true })

    // 3. ffmpeg composite:
    //    • bg clip: scaled to 1920×1080, blended at 55% opacity over dark #0d1414 base
    //    • overlay PNG: fade-in over 1 second (alpha=1 means alpha-channel fade)
    const fg = [
      `[0:v]scale=1920:1080,format=rgba,colorchannelmixer=aa=0.55[scaled]`,
      `color=c=#0d1414:s=1920x1080:r=30,format=rgba[base]`,
      `[base][scaled]overlay[darkbg]`,
      `[1:v]fade=t=in:st=0:d=1:alpha=1[ovl]`,
      `[darkbg][ovl]overlay[out]`,
    ].join(";")

    execSync(
      `ffmpeg -y -i "${srcLocal}" -loop 1 -i "${overlayPng}" -t ${dur} ` +
      `-filter_complex "${fg}" -map "[out]" ` +
      `-c:v libx264 -preset fast -crf 20 -movflags +faststart "${outputPath}"`,
      { timeout: INTRO_RENDER_TIMEOUT_MS, stdio: "pipe" }
    )

    return outputPath
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {})
  }
}
