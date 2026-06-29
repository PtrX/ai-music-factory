#!/usr/bin/env tsx
/**
 * QA-Script: testet den ffmpeg-basierten Intro-Renderer lokal.
 * Aufruf:  npx tsx scripts/test-intro-renderer.ts
 * Output:  /tmp/intro-qa-test.mp4  (mit `open` automatisch geöffnet)
 */
import { renderIntro } from "../lib/intro-renderer"
import { execSync } from "child_process"

const OUTPUT = "/tmp/intro-qa-test.mp4"

const BACKGROUND_CLIP =
  process.argv[2] ??
  `${process.cwd()}/storage/clips/pexels-9990309.mp4`

async function main() {
  console.log("🎬  Starte Intro-Renderer QA…")
  console.log(`    Hintergrund-Clip: ${BACKGROUND_CLIP}`)
  console.log(`    Output:           ${OUTPUT}`)

  const start = Date.now()

  await renderIntro({
    title: "Свет моей души",
    version: "Uplifting Anthem Mix",
    accentColor: "#29b5a8",
    backgroundClipPath: BACKGROUND_CLIP,
    introDurationSec: 5,
    outputPath: OUTPUT,
  })

  const elapsed = ((Date.now() - start) / 1000).toFixed(1)
  console.log(`✅  Fertig in ${elapsed}s → ${OUTPUT}`)

  // macOS: direkt öffnen
  try {
    execSync(`open "${OUTPUT}"`)
  } catch {
    console.log("    (konnte nicht automatisch öffnen)")
  }
}

main().catch((err) => {
  console.error("❌  Fehler:", err.message ?? err)
  process.exit(1)
})
