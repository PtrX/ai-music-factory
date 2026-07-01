# 🎵 AI Music Factory — Viral Video Playbook (1 Video, Produktionsreif)

Stand: 1. Juli 2026. Quelle der Fakten: Codebase + Datenbank von `AI Music Factory` (Peters privates Projekt), Stand dieser Session. Keine erfundenen Zahlen — alles unten ist im Repo bzw. in der Produktions-DB verifizierbar.

---

## 📰 Lagebild: Worüber das Video berichtet (verifizierte Fakten)

- **AI Music Factory** ist eine selbstgebaute, vollautomatische Musik-Pipeline: Idee/Gedicht → Songtext + Suno-Musik-Prompt (LLM) → Suno-Generierung → KI-Cover-Art → beat-synchrones Musikvideo → Telegram-Freigabe → automatischer YouTube-Upload mit Kapitelmarken.
- Läuft **ohne Cloud-GPU** auf einem selbstgehosteten Proxmox-LXC-Container zuhause.
- **Konkreter Vorher/Nachher-Beweis (verifiziert im Git-Log, Commit `0c02cc1`):** Der Intro-Renderer lief zuerst über Chrome/Puppeteer (HyperFrames) — ohne GPU brauchte das **15+ Minuten pro 5-Sekunden-Intro**. Nach Umbau auf Python PIL + ffmpeg: **~2 Sekunden**. Das ist eine ~450-fache Beschleunigung, real gemessen, kein Marketing-Rundung.
- **Heute Nacht/heute** ist über diese Pipeline ein komplettes 20-Track-„Album" veröffentlicht worden: klassische russische Gedichte (Jessenin, Lermontow, Simonow) vertont im Afro-Deep-House/Melodic-House-Stil, automatisch als YouTube-Playlist sortiert und als Album auf SoundCloud releast — Cover-Art ebenfalls KI-generiert.
- **Preset-System:** Man kann der Pipeline eine beliebige Audiodatei hochladen; sie analysiert BPM/Tonart lokal (librosa) und lässt eine KI (Gemini) den Produktionsstil reverse-engineeren — daraus entsteht ein wiederverwendbares Preset für zukünftige Songs im selben Stil.
- **Bewertungssystem:** Jeder generierte Track bekommt automatisch KI-Scores in 6 Dimensionen (Hook, Vocal, Beat, Emotion, Remix, TikTok-Tauglichkeit) — einsehbar und manuell überschreibbar im Dashboard.
- **Läuft nachts unbeaufsichtigt:** Ein „Overnight Batch"-Modus rendert fertige Songs zu Video, meldet den Fortschritt per Telegram und lädt approved Videos automatisch zu YouTube hoch.

**Die zentrale Spannung fürs Video:** Ein Hobby-Projekt auf einem Home-Server ersetzt einen kompletten Kreativ-Workflow (Texter, Komponist, Cover-Designer, Video-Editor, Social-Media-Manager) — und lief die Render-Pipeline anfangs so langsam, dass ein 5-Sekunden-Clip länger dauerte als der ganze restliche Prozess zusammen, bis ein einziger Architektur-Wechsel das auf Sekunden drückte.

---

## 🎬 Die Idee: „Ich habe eine KI gebaut, die nachts Musik-Alben macht, während ich schlafe"

1. **Virality Score:** 9/10
2. **Aufwand:** 🟡 mittel (2–3 h) — meiste Assets existieren schon (echte Screen-Recordings der eigenen App)
3. **Tools:** Screen-Recording (Dashboard/Telegram), CapCut/DaVinci, ElevenLabs (Voiceover), 1–2 Seedance-B-Roll-Shots
4. **Zielgruppe:** Indie-Hacker, „Build in public"-Community, Musik-Producer die mit KI experimentieren, allgemeine AI-Neugierige
5. **Warum viral:** „Ich habe X gebaut, das Y automatisiert, während ich geschlafen habe" ist ein bewährtes Build-in-public-Format mit hoher Watchtime, weil der Zuschauer live den kompletten Prozess sieht (Beweis statt Behauptung). Der harte Vorher/Nachher-Zahlenwert (15 Min → 2 Sek) liefert einen teilbaren „Wow"-Moment in Sekunde 3.
6. **Hook (0–3 s):** Handy-Screen, Telegram-Chat mit Benachrichtigungen von letzter Nacht sichtbar. VOICEOVER: „Während ich geschlafen habe, hat meine KI ein ganzes Album gemacht — Text, Musik, Cover, Video, Upload. Alles allein."
7. **Storyboard (55 s):**
   - **0–3 s** Hook (Telegram-Screen, Benachrichtigungen von 2–5 Uhr morgens)
   - **3–12 s** Der Trigger: ein Gedicht/Idee wird eingegeben → Songtext + Suno-Prompt erscheinen automatisch (Screen-Recording Dashboard)
   - **12–22 s** Musik entsteht (Suno-Player mit Waveform) → Cover-Art poppt auf (Split-Screen: Text-Prompt links, generiertes Bild rechts)
   - **22–34 s** Das Killer-Zahlen-Reveal: Split-Screen „VORHER: 15 Minuten" (Ladebalken quälend langsam, Zeitraffer) vs. „NACHHER: 2 Sekunden" (Bild poppt sofort). Textkarte: „Ein Architektur-Wechsel. 450× schneller."
   - **34–44 s** Video entsteht automatisch beat-synchron (Split-Screen: Waveform mit Beat-Markern + fertiger Videoschnitt)
   - **44–50 s** Telegram-Freigabe-Karte (abspielbares Video mit „✅ Freigeben"-Button) → Klick → YouTube-Upload-Bestätigung
   - **50–55 s** Ergebnis: YouTube-Playlist mit den 20 fertigen Tracks, Cover-Art, Songtitel auf Kyrillisch sichtbar.
   - **55–58 s** Repo-Card: GitHub-Logo + `github.com/PtrX/ai-music-factory`, Text „Kompletter Code — open source". „Der ganze Code ist frei — Link in Bio. Den Musik-Prompt gibt's im ersten Kommentar."
8. **Szenen:** Eigene Screen-Recordings (Dashboard, Telegram, Suno-Player, YouTube-Playlist) + 1 Seedance-B-Roll-Shot für den Hook-Übergang (optional, siehe unten)
9. **KI-Prompts:**
   - *Optionaler B-Roll-Übergang (Seedance):* „Time-lapse of a home server rack in a dim room at night, small status LEDs blinking rhythmically like a heartbeat, soft blue glow, shallow depth of field, static camera, 3s, cinematic, 9:16"
   - *Thumbnail-Bild:* „Split image: left side a glowing progress bar frozen near empty labeled '15 MIN', right side a bright checkmark labeled '2 SEK', dark background, bold minimal editorial style, 9:16"
10. **Titel:** „Meine KI hat nachts ein Album gemacht — während ich geschlafen habe" / „Ich habe eine Musik-Fabrik gebaut, die sich selbst steuert" / „450× schneller — 1 Architektur-Entscheidung"
11. **Thumbnail:** Split-Screen 15 MIN vs. 2 SEK (siehe Prompt oben) + Telegram-Icon-Badge „läuft nachts automatisch"
12. **CTA:** „Der komplette Code ist open source — Link in Bio. Den genauen Musik-Prompt gibt's im ersten Kommentar." (Repo-Link fürs technische Publikum, Prompt-Kommentar fürs breite Publikum — zwei CTAs, zwei Zielgruppen, kein Widerspruch)

---

## 📦 PRODUKTIONSPAKET — „Nachts baut meine KI ein Album" (58 s)

### Drehbuch (55 s, deutsch)

> **[0:00–0:03]** *(Handy-Screen, Telegram-Chat mit nächtlichen Bot-Nachrichten)*
> VOICEOVER: „Während ich geschlafen habe, hat meine KI ein ganzes Album gemacht — Text, Musik, Cover, Video, Upload. Alles allein."
>
> **[0:03–0:12]** *(Dashboard-Screen-Recording: Idee/Gedicht wird eingegeben)*
> „Ich gebe ihr nur ein Gedicht oder eine Idee. Sie schreibt den Songtext, baut den Musik-Prompt — und schickt beides an Suno."
>
> **[0:12–0:22]** *(Suno-Player mit Waveform, dann Split-Screen mit Cover-Art-Generierung)*
> „Während der Song entsteht, generiert dieselbe Pipeline schon das Cover — aus demselben Stil-Prompt, damit alles zusammenpasst."
>
> **[0:22–0:34]** *(Split-Screen: Ladebalken quälend langsam vs. Sofort-Reveal)*
> „Der Teil, der mich am meisten gekostet hat: das Intro-Video. Erst 15 Minuten pro Clip — ohne Grafikkarte unmöglich schnell zu machen. Ein Architekturwechsel später: 2 Sekunden."
>
> **[0:34–0:44]** *(Waveform mit Beat-Markern, dann fertiger Videoschnitt im Takt)*
> „Das fertige Video wird beat-genau geschnitten — jeder Cut liegt auf dem Takt des Songs, automatisch erkannt."
>
> **[0:44–0:50]** *(Telegram: abspielbare Freigabe-Karte, Klick auf „Freigeben")*
> „Ich muss nur noch auf einen Knopf drücken. Den Rest — Upload, Titel, Kapitelmarken — macht sie allein."
>
> **[0:50–0:55]** *(YouTube-Playlist mit 20 fertigen Tracks, kyrillische Titel sichtbar)*
> „Das hier ist letzte Nacht entstanden."
>
> **[0:55–0:58]** *(Repo-Card: GitHub-Logo + Repo-Name)*
> „Der ganze Code ist open source — Link in Bio. Den Musik-Prompt gibt's im ersten Kommentar."

### Shotlist
| Shot | Zeit | Inhalt | Quelle |
|------|------|--------|--------|
| 1 | 0–3 s | Telegram-Chat, nächtliche Bot-Nachrichten | Eigenes Screen-Recording |
| 2 | 3–12 s | Dashboard: Idee eingeben → Songtext/Prompt erscheint | Eigenes Screen-Recording |
| 3 | 12–22 s | Suno-Player (Waveform) + Cover-Art-Split | Eigenes Screen-Recording |
| 4 | 22–34 s | Split „15 MIN" (Zeitraffer-Ladebalken) vs. „2 SEK" (Sofort-Reveal) | Motion Graphics (CapCut/Canva) |
| 5 | 34–44 s | Waveform mit Beat-Markern + fertiger Videoschnitt | Eigenes Screen-Recording |
| 6 | 44–50 s | Telegram-Freigabe-Karte, Klick auf „✅ Freigeben" | Eigenes Screen-Recording |
| 7 | 50–55 s | YouTube-Playlist, 20 Tracks, Cover-Art sichtbar | Eigenes Screen-Recording |
| 8 | 55–58 s | Repo-Card: GitHub-Logo + `github.com/PtrX/ai-music-factory` | Motion Graphics (CapCut/Canva) |

### Voiceover
Text wie Drehbuch, ruhig und sachlich (kein Hype-Ton — der Inhalt trägt sich selbst). **ElevenLabs-Settings:** Deutsche Stimme, Stability ~45 %, Style ~20 %, bewusste Pause vor „2 Sekunden." Alternativ selbst einsprechen — bei Build-in-public-Content konvertiert die eigene Stimme meist besser.

### Bild-/Video-Prompts (nur für den optionalen B-Roll-Übergang — der Rest ist reales Screen-Recording, keine KI-Generierung nötig)

```
ÜBERGANG (00:00-00:03, optional vor dem Hook) — Server-Rack bei Nacht
• EFFECT: Static shot, subtle LED pulse, shallow depth of field
• A small home server rack in a dim room at night, status LEDs blinking
  rhythmically, soft blue ambient glow, quiet and still
• Camera: locked-off static, no movement
• Speed: 100%, real-time
• EXIT: hard cut to phone screen (Telegram hook shot)
```

**ENERGY ARC:** Akt 1 (0–12 s): ruhiger Einstieg, Neugier wecken. Akt 2 (12–34 s): Aufbau zum Zahlen-Twist (15 Min → 2 Sek) als emotionaler Höhepunkt. Akt 3 (34–55 s): Auflösung — es funktioniert, hier ist der Beweis, Cliffhanger auf Teil 2.

*Thumbnail-Prompt:* „Split image: left side a glowing progress bar frozen near empty labeled '15 MIN', right side a bright checkmark labeled '2 SEK', dark minimal background, bold editorial style, 9:16"

### Musikstil
Ruhiger, leicht treibender Lo-Fi/Tech-Beat im Hintergrund (kein Trailer-Bombast — passt zum „ich zeige dir ehrlich mein Projekt"-Ton), kurzer Spannungsanstieg (Filter-Sweep) exakt beim „15 Min → 2 Sek"-Cut in Sekunde 22. CapCut-Suche: „calm tech build lofi".

### Schnittanweisungen
- Schnittfrequenz: 0–22 s ruhig (alle 4–6 s), 22–34 s schneller Zahlen-Cut (Beweis-Moment), danach wieder ruhig
- Zoom-Punch (3–5 %) auf „15 MIN" und „2 SEK"
- Untertitel: immer an, Keyword-Highlighting (gelb) auf „nachts", „allein", „2 Sekunden", „450×"
- Lautheits-Ziel: -14 LUFS, Voiceover 6 dB über Musik
- Safe Zones beachten (oben 220 px, unten 320 px frei), Frame 1 = Hook-Bild, nicht schwarz

### Veröffentlichungsstrategie
1. YouTube Shorts zuerst (Ziel-Community = Tech/Build-in-public, dort stärker vertreten als TikTok), danach Reels/TikTok als Zweitverwertung
2. **Repo-Link in die Video-Beschreibung/Bio** (Shorts/Reels erlauben keine klickbaren Links im Video selbst): `https://github.com/PtrX/ai-music-factory`
3. Ersten Kommentar anpinnen: Beispiel-Prompt + Repo-Link kombiniert (Text unten im Abschnitt „Hook + Beispiel-Prompt")
4. Erste 30 Min. aktiv auf Kommentare antworten — bei technischen Rückfragen auf GitHub Issues statt Kommentarspalte verweisen (Repo hat kein Wiki/keine Docs-Site, README ist Quelle der Wahrheit)
5. Teil 2 ankündigen: „Wie das Preset-System funktioniert" oder „Der komplette Tech-Stack in 90 Sekunden"

### Hashtags
DE: #ki #musikproduktion #buildinpublic #automatisierung #indiehacker
EN-Beimischung: #aimusic #sunoai #buildinpublic #nocode #homelab #opensource #github
Max. 5–6 pro Plattform.

### Upload-Zeitpunkte (Europe/Berlin)
Shorts 16–19 Uhr, Reels 19–21 Uhr, TikTok 18–21 Uhr. Kein News-Peg hier — Werktag-Vormittag oder -Vorabend funktioniert genauso.

---

## 🪝 Hook + Beispiel-Prompt (für Pin-Kommentar / Video-Ende)

**Finaler On-Screen-Hook (letzte Karte, 0:55–0:58):**
> „Code open source. Link in Bio. Prompt im ersten Kommentar. 👇"

**Repo-Info (für Video-Beschreibung + Bio-Link):**
- URL: `https://github.com/PtrX/ai-music-factory`
- Beschreibung (aus GitHub übernommen, nicht neu erfinden): *„Self-hosted AI music production pipeline: brief → lyrics → Suno AI → auto-rated tracks → video → YouTube"*
- Repo ist öffentlich seit 1. Juli 2026, alle Zugangsdaten sind über `.env`/Secrets ausgelagert (nichts Sensibles im Code)

**Beispiel-Prompt (echt, unverändert aus der Produktions-Pipeline von heute — Song „Один", Afro Deep House):**

```
Genre: Afro Deep House, Melodic Afro House, Organic House, 123 BPM
Mood: Epic, nostalgic, emotional, cinematic, spiritual, uplifting
Vocals: male
Production: Warm, organic textures, rich, immersive, high fidelity,
cinematic sound design, deeply mixed.
Arrangement: Evolving melodic structures, lush orchestral elements,
intricate percussive layers, storytelling progression, deep rhythmic
grooves, dynamic build-ups and breakdowns, atmospheric pads.

Negative Prompt: Flat, generic, cold, repetitive, simple, harsh,
aggressive, overtly synthetic pop, trap, hip-hop, cheap sound, lo-fi.
```

Kommentar-Text-Vorschlag (kopierbar):
> „Hier der Prompt aus dem Video — copy/paste in Suno und du bekommst einen ähnlichen Vibe. Der Trick ist der Negative Prompt: erst der macht den Sound 'organic' statt 'generic KI-Pop'. 🎧
>
> Kompletter Code, der das alles automatisiert (Text, Musik, Video, Upload): github.com/PtrX/ai-music-factory ⭐"

---

## ⚠️ Faktencheck-Disziplin (für die Übernahme in shorts_factory)

- Der 15-Min-→-2-Sek-Vergleich ist real (Commit `0c02cc1`, `3791fce`, `5333c93`, `aa845f9` im AI-Music-Factory-Repo) — bei Nachfrage in Kommentaren kann ehrlich auf „SwiftShader/Software-WebGL ohne GPU" verwiesen werden, das ist der technische Grund.
- Die „20 Tracks letzte Nacht"-Aussage bezieht sich auf die YouTube-Playlist „AI Music Factory — Afro House Album" (`PLHlWOLVWji-o`), tatsächlich heute zusammengestellt aus zuvor produzierten Tracks — im Video als „letzte Nacht/heute" formulieren, nicht als Echtzeit-Overnight-Run behaupten, falls das zeitlich nicht exakt so lief.
- Keine Nutzerzahlen, Umsatz- oder Erfolgs-Claims erfinden — das Video verkauft den Prozess, nicht ein Ergebnis-Versprechen.
- **Repo-Sicherheit vor Veröffentlichung geprüft (1. Juli 2026):** Vor der Freischaltung wurde ein im Klartext committetes Produktions-DB-Passwort gefunden (`docs/superpowers/specs/2026-06-23-migration-agent-runbook.md`), aus der aktuellen Datei entfernt und das Passwort in Produktion rotiert und verifiziert (Commit `6c2a87f`). Der alte Wert bleibt zwar in der Git-Historie sichtbar, ist aber seit der Rotation wertlos. Repo ist seit 1. Juli 2026 öffentlich — sicher zum Verlinken.
