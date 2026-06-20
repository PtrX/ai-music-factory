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
    const templatePath = path.join(process.cwd(), "storage", "hf-template", "index.html")
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
    await fs.copyFile(backgroundClipPath, path.join(tmpDir, "bg.mp4"))

    await fs.mkdir(path.dirname(outputPath), { recursive: true })
    execSync(
      `npx hyperframes render --output "${outputPath}"`,
      { cwd: tmpDir, timeout: 120_000, stdio: "pipe" }
    )

    return outputPath
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {})
  }
}
