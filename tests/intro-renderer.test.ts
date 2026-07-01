import assert from "node:assert/strict"
import { INTRO_RENDER_TIMEOUT_MS, INTRO_CREDIT } from "../lib/intro-renderer"

assert.equal(INTRO_CREDIT, "AI Music Factory by PTRX")
assert.equal(INTRO_RENDER_TIMEOUT_MS, 120_000)

console.log("intro renderer tests passed")
