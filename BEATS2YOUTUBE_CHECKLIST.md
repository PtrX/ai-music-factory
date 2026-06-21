# Beats2YouTube — Video-Pipeline Checkliste

> **Zweck:** Lebende Checkliste für die Video-Pipeline (Track → beatgenaues YouTube-Video).
> Bei JEDER Änderung gegen diese Liste abgleichen. Neue Erkenntnisse hier eintragen,
> damit Wissen nicht verloren geht. Quelle der Wahrheit für „was muss / was darf nicht".
>
> Verwandt: `docs/superpowers/specs/2026-06-20-video-pipeline-design.md` (Original-Spec),
> `HANDOFF.md` (Session-Stand).

---

## ✅ MUSS (Anforderungen)

### Beat-Genauigkeit
- [ ] **Lückenlose Timeline**: Clips kacheln von `introOffset` bis zur **echten Audio-Dauer** ohne Lücken. Jeder Schnitt = Clip-Grenze → Concat landet auf dem Beat. (`buildDirectives`)
- [ ] **Frame-Snap**: alle Schnittzeiten auf 1/30 s gerundet (kein Sub-Frame-Jitter, keine Akkumulation).
- [ ] **Akzent-Schnitte**: erzwungener Szenenwechsel **exakt** auf herausragenden Drum-Hits. Akzent = lokaler Onset-Peak (`beatStrength` ≥ 0,45 **und** ≥ 2× lokaler Schnitt). Schnitt sitzt auf dem Hit, nicht 1 s später.
- [ ] **Downbeat-Ausrichtung**: Grid-Schnitte auf die „1" des Takts (Phase aus `beatStrength`, argmax über `i % 4`). Global indexiert, damit über Section-Grenzen konsistent.
- [ ] **Ruhige Sections halten lange** (low groupSize = 8): kein Geflacker, wo keine Percussion ist. Dichte steigt mit Energie (low 8 / medium 4 / high 2 / peak 1).
- [ ] **Intro-Offset**: B-Roll startet bei Song-Zeit = Intro-Dauer (per ffprobe des Intros), damit Sync nach dem vorangestellten Intro erhalten bleibt.

### Bild
- [ ] **Kein Pillarbox/Letterbox**: Clips füllen 1920×1080 per **Zoom/Crop** (`scale=...:force_original_aspect_ratio=increase,crop=1920:1080`). NIE schwarze Balken.
- [ ] **Portrait-Clips ausschließen** an der Quelle: Pexels `orientation=landscape` + nur `width > height`.
- [ ] **Output**: 1920×1080, 30 fps, yuv420p, H.264, AAC 320k. (→ **1080p**, siehe Verbot 4K.)
- [ ] **HyperFrames-Intro ist Pflicht** (Spec Phase 3), kein optionales Extra. Intro-Format muss exakt 1920×1080 / 30 fps / yuv420p sein, damit der `-c copy`-Concat sauber ist.

### Daten / Analyse
- [ ] **`beatStrength` muss in der DNA** sein (`analyze_audio.py` → `beatTimes` + `beatStrength`). Ohne `beatStrength`: keine Akzent-/Downbeat-Erkennung → Fallback auf reines Grid. → Tracks müssen (neu) analysiert werden.
- [ ] **Audio-Dauer per ffprobe** ermitteln (`structure.totalDurationSec` ist oft `undefined`/falsch).

### Performance & Robustheit
- [ ] **Final-Encode ohne Re-Encode**, wenn keine Untertitel: Intro+B-Roll `-c copy` + Audio muxen (`-c:v copy`). Sekunden statt Minuten.
- [ ] **`-stream_loop` nur bei zu kurzen Quellclips** (sonst Truncation → Drift; aber kein Loop-Overhead für normale Clips).
- [ ] **Worker reapt verwaiste ffmpeg** beim Start und beim Shutdown (`killOrphanedFfmpeg`).
- [ ] Renderzeit-Richtwert: **~2 Min** für 1080p / ~4 Min Track. Deutlich länger ⇒ Zombies oder Timeout-Retry prüfen.

### Workflow
- [ ] Status-Flow: `queued → rendering → ready → (Freigabe) → uploading → done`.
- [ ] **YouTube-Upload nur nach expliziter Freigabe** (Telegram-Button / UI).

---

## ⛔ DARF NICHT

- [ ] **Kein Preview-Modus** (entfernt in `ae50e3a`): verursachte 10-Min-Renders / Timeouts. Nur volles 1080p.
- [ ] **Kein 4K** — bewusste Entscheidung (2026-06-21): 1080p bleibt. (~4× Renderzeit, nicht alle Pexels-Clips haben 4K.)
- [ ] **Keine schwarzen Balken** (kein `pad=`) — immer Crop-to-Fill.
- [ ] **Kein zeit-addierender Flash-Cut**: das alte `flash-cut` hängte je 0,04 s weißes Frame VOR den Clip → Drift. Akzente nutzen aktuell **saubere Schnitte** (energy `high`), kein Flash. Falls Flash gewünscht: muss drift-neutral sein (Clip um Flash-Dauer kürzen, nicht anhängen).
- [ ] **Worker nicht mitten im Render mit `-9` killen** ohne ffmpeg-Reap → CPU-Zombies (beobachtet: 3 h alte Encodes bei 600 % CPU, bremsten jeden Render). Graceful beenden oder auf Startup-Cleanup verlassen.
- [ ] **Nicht auf `structure.totalDurationSec` verlassen** — ffprobe nutzen.
- [ ] **Telegram nicht zum Video-Review nutzen**: das Bot-Tool sendet mp4 nur als *Dokument* → beim Nutzer nur Standbild, nicht abspielbar. Review immer **lokal** (`open …mp4`) oder via YouTube-Link. (Sehr kleine mp4 ≤ ~5 MB spielen evtl.)
- [ ] **YouTube-Upload ist `privacyStatus: "public"`** — nie ohne Bestätigung hochladen.
- [ ] **Clip-Pool < Directives** ⇒ Wiederholungen. Aktuell Pool 80 vs ~150 Directives → ~70 Wdh. Bei Bedarf `targetPoolSize` hoch oder Pixabay als 2. Quelle in `buildClipPool`.

---

## ⚠️ Gotchas (Betrieb)

- **tsx lädt nicht neu** — nach Code-Änderung Worker **neu starten**, sonst alter Code.
- **`resetStaleJobs` reaktiviert „processing"-Jobs** beim Start → kann alte Renders erneut auslösen. Vor Neustart Queue säubern, sonst doppelter Render.
- **YouTube-Tokens** in `storage/youtube-tokens.json` (Refresh-Token vorhanden, expiry beachten). Credentials in `.env.local`.
- **`buildClipPool` nutzt nur Pexels**; `findClipForDirective` (nur Intro-Hintergrund) kann Pixabay-Fallback ohne Portrait-Filter ziehen → nur Intro-BG betroffen.
- **`detectImpactBeats`** in `visual-director.ts` ist seit Akzent-Umbau **toter Code** (Aufräum-Kandidat).

---

## 🔬 Verifikations-Protokoll (pro Render)

```bash
F=…/track_X-final.mp4
# 1. Format & Länge
ffprobe -v error -select_streams v:0 -show_entries stream=width,height,r_frame_rate,pix_fmt -of csv=p=0 "$F"
#    → 1920,1080,30/1,yuv420p ; Dauer == Audio-Dauer
# 2. Keine schwarzen Balken
ffmpeg -i "$F" -vf cropdetect=24:2:0 -t 60 -f null - 2>&1 | grep -oE "crop=[0-9:]+" | sort | uniq -c
#    → nur crop=1920:1080:0:0
# 3. Schnitte vs. Beats (Szenenerkennung)
ffmpeg -i "$F" -filter:v "select='gt(scene,0.3)',showinfo" -f null - 2>&1 | grep -oE "pts_time:[0-9.]+"
#    → Cuts ~±0,1 s an beatTimes; Akzent-Hits haben einen Cut; Groove-Cuts auf Downbeats
# 4. Intro-Naht: Frames um Intro-Ende prüfen (kein Schwarzbild/Glitch)
```

Review immer **lokal** öffnen (`open "$F"`), nicht über Telegram beurteilen.

---

## 📋 Offene Punkte

- [ ] Andere Tracks (a2/b1/b2 …) neu analysieren → `beatStrength` in DNA, dann Videos rendern.
- [ ] `detectImpactBeats` (toter Code) entfernen.
- [ ] Optional: Clip-Pool vergrößern / Pixabay als 2. Quelle gegen Wiederholungen.

---

_Stand: 2026-06-21. Bei neuen Erkenntnissen direkt hier ergänzen._
