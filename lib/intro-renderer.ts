import * as fs from "fs/promises"
import * as path from "path"
import * as os from "os"
import { execSync } from "child_process"

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

  const tmpDir = path.join(os.tmpdir(), `hf-intro-${Date.now()}`)
  await fs.mkdir(tmpDir, { recursive: true })

  try {
    const templatePath = path.join(process.cwd(), "templates", "hf-template", "index.html")
    let html = await fs.readFile(templatePath, "utf-8")

    const vars = JSON.stringify([
      { id: "title", type: "string", label: "Title", default: title },
      { id: "version", type: "string", label: "Version", default: version },
      { id: "credit", type: "string", label: "Credit", default: "AI Music Factory" },
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

    // Re-encode bg clip with dense keyframes (required by HyperFrames for seek)
    const bgPath = path.join(tmpDir, "bg.mp4")
    execSync(
      `ffmpeg -y -i "${backgroundClipPath}" -t ${dur + 1} ` +
      `-c:v libx264 -r 30 -g 30 -keyint_min 30 -movflags +faststart -an "${bgPath}"`,
      { timeout: 60_000, stdio: "pipe" }
    )

    await fs.mkdir(path.dirname(outputPath), { recursive: true })
    execSync(
      `npx hyperframes render --output "${outputPath}"`,
      { cwd: tmpDir, timeout: 180_000, stdio: "pipe" }
    )

    return outputPath
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {})
  }
}
