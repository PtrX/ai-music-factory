import assert from "node:assert/strict"
import { HYPERFRAMES_RENDER_TIMEOUT_MS, INTRO_CREDIT } from "../lib/intro-renderer"

assert.equal(INTRO_CREDIT, "AI Music Factory by PTRX")
assert.equal(HYPERFRAMES_RENDER_TIMEOUT_MS, 900_000)

console.log("intro renderer tests passed")
