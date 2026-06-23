import assert from "node:assert/strict"
import { validateGeneratedLyrics } from "../lib/generators/lyrics"

const completeLyrics = `[Intro]
First image line

[Verse 1]
Line one
Line two
Line three
Line four

[Pre-Chorus]
Lift line one
Lift line two

[Chorus]
Hook one
Hook two
Hook three
Hook four

[Drop Hook]
Drop one
Drop two

[Verse 2]
Line five
Line six
Line seven
Line eight

[Final Chorus]
Final hook one
Final hook two
Final hook three
Final hook four

[Outro]
Closing line`

const truncatedLyrics = `[Intro]
Opening line

[Verse 1]
Some line

[Pre-`

assert.equal(validateGeneratedLyrics(completeLyrics).valid, true)

const truncated = validateGeneratedLyrics(truncatedLyrics)
assert.equal(truncated.valid, false)
assert.match(truncated.reason ?? "", /incomplete|missing/i)

console.log("lyrics validation tests passed")
