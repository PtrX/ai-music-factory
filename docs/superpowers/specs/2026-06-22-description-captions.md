# Spec — YouTube Description, DNA Chapters, Captions, Cleanup (2026-06-22)

Ship-by 22:00, best quality. Verified per change, multi-agent QA at the end.

## 1. Rich YouTube description  (`lib/youtube-client.ts`, `worker/index.ts`)
`buildYouTubeDescription({ structure, aiNotes, genre })` →, in order:
1. **Vibe line** from `aiNotes`: first sentence only (the positive one). Drop the
   critique that starts at "While …" / "What holds it back …". No LLM.
2. **Chapters** (see §2) — only if ≥3 valid markers.
3. **Credit**: "🎶 Produced with AI Music Factory — music, cover & video, fully AI-assisted."
4. **CTA / hook**: invite a comment about how it's made (the "little campaign").
- No genre/BPM/prompt dump. Style may appear naturally (it's inside the vibe line).
- Worker passes `track.aiNotes` + `project.genre`.

## 2. DNA sections → YouTube chapters  (`lib/youtube-client.ts`)
Build `M:SS Label` lines from `structure.sections`:
- First marker forced to `0:00`.
- Label from position+energy: i=0 → "Intro", last → "Outro", else
  {low:"Breakdown", medium:"Groove", high:"Build", peak:"Drop"}.
- Collapse consecutive duplicate labels; enforce ascending & ≥10s apart
  (YouTube chapter rules); need ≥3 markers else omit chapters entirely.

## 3. Captions / SRT  (`worker/index.ts`, `lib/youtube-client.ts`)
- **SRT for generated (Suno) tracks**: run `extractLyricsWithTimestamps` (Whisper)
  on the track audio at render time if `track.srtPath` is missing; save `.srt`,
  set `track.srtPath`. Enables burn-in (already wired in assembleFullVideo).
- **Upload caption track**: after a successful video upload, `youtube.captions.insert`
  the SRT so viewers get toggleable CC.
- ⚠️ Scope: captions.insert needs `youtube.force-ssl` (current token only
  `youtube.upload`). Update the OAuth scope in the auth URL; **user must
  re-consent** — until then captions.insert is skipped with a clear log.

## 4. Cleanup  (`lib/visual-director.ts`)
- Remove the now-dead `detectImpactBeats` function (unused since accent rewrite).

## QA
Multi-agent adversarial review of the full diff: correctness, YouTube API
shape (chapters rules, captions request), edge cases (missing aiNotes/sections,
short tracks), regressions to the upload path. Apply confirmed findings.
