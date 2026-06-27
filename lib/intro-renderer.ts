import * as fs from "fs/promises"
import * as os from "os"
import * as path from "path"
import { execSync } from "child_process"

export const INTRO_CREDIT = "AI Music Factory by PTRX"
export const HYPERFRAMES_RENDER_TIMEOUT_MS = 900_000

export interface IntroRenderInput {
  title: string
  version: string
  accentColor: string
  backgroundClipPath: string
  introDurationSec: number
  outputPath: string
}

export async function renderIntro(input: IntroRenderInput): Promise<string> {
  const { title, version, accentColor, backgroundClipPath, introDurationSec, outputPath } = input

  // Use local /tmp (not NAS) — Chrome profile + ffmpeg I/O on NFS causes ETIMEDOUT
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "hf-intro-"))
  const tempEnv = { ...process.env, TMPDIR: tmpDir, TMP: tmpDir, TEMP: tmpDir }

  try {
    const templatePath = path.join(process.cwd(), "templates", "hf-template", "index.html")
    let html = await fs.readFile(templatePath, "utf-8")

    const vars = JSON.stringify([
      { id: "title", type: "string", label: "Title", default: title },
      { id: "version", type: "string", label: "Version", default: version },
      { id: "credit", type: "string", label: "Credit", default: INTRO_CREDIT },
      { id: "accent", type: "color", label: "Accent", default: accentColor },
    ])
    html = html.replace(
      /data-composition-variables='[^']*'/,
      `data-composition-variables='${vars}'`
    )

    const dur = Math.max(3, Math.min(introDurationSec, 10))
    html = html.replace(/data-duration="\d+"/g, `data-duration="${dur}"`)

    await fs.writeFile(path.join(tmpDir, "index.html"), html)

    // Copy GSAP so Chrome can load it offline (index.html references it as relative path)
    const templateDir = path.join(process.cwd(), "templates", "hf-template")
    await fs.copyFile(path.join(templateDir, "gsap.min.js"), path.join(tmpDir, "gsap.min.js"))

    // Copy source clip from NAS to local /tmp first to avoid NFS read latency in ffmpeg
    const srcLocal = path.join(tmpDir, "src.mp4")
    await fs.copyFile(backgroundClipPath, srcLocal)

    // Re-encode bg clip with dense keyframes (required by HyperFrames for seek)
    const bgPath = path.join(tmpDir, "bg.mp4")
    execSync(
      `ffmpeg -y -i "${srcLocal}" -t ${dur + 1} ` +
      `-c:v libx264 -r 30 -g 30 -keyint_min 30 -movflags +faststart -an "${bgPath}"`,
      { timeout: 120_000, stdio: "pipe" }
    )

    // Render intro to local tmp first, then copy to NAS output path
    const localOutput = path.join(tmpDir, "intro.mp4")
    await fs.mkdir(path.dirname(outputPath), { recursive: true })
    const hfBin = path.join(process.cwd(), "node_modules", ".bin", "hyperframes")
    execSync(
      `"${hfBin}" render --output "${localOutput}"`,
      { cwd: tmpDir, env: tempEnv, timeout: HYPERFRAMES_RENDER_TIMEOUT_MS, stdio: "pipe" }
    )

    await fs.copyFile(localOutput, outputPath)
    return outputPath
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {})
  }
}
