# Design: Song Upload Pipeline

_Datum: 2026-06-19_

---

## Ziel

Bereits existierende Suno-Songs (und andere MP3s) in die AI Music Factory importieren. Ein Projekt entspricht einem Song-Titel mit mehreren Versionen als Varianten. Der Upload-Flow erlaubt Batch-Import mit ID3-Extraktion, KI-Analyse, Lyrics-Handling und KI-Scoring — alles async über die bestehende Worker-Queue.

---

## Use Case

1. Leeres Projekt anlegen (nur Name)
2. Mehrere MP3s per Drag & Drop hochladen
3. Vorschau-Tabelle: Variantenname editieren, Lyrics-Modus wählen
4. "Importieren" → sofortige Rückmeldung, Analyse läuft im Hintergrund
5. Sidebar-Polling zeigt Fortschritt bis `completed`
6. Ergebnis: Scores, Struktur, KI-Namensvorschlag, Lyrics

---

## Datenmodell

### Neue Felder

**Variant:**
```
sourceType  String  @default("suno")   // "suno" | "upload"
```

**Track:**
```
isInstrumental  Boolean  @default(false)
lyricsSource    String?                // "id3" | "ai" | "manual" | null
```

### Neuer Variant-Status

`"importing"` wird dem bestehenden Status-Enum hinzugefügt (neben `draft`, `prompt_ready`, `queued`, `generating`, `completed`, `failed`). Sidebar-Polling behandelt `importing` wie `queued` — zeigt Spinner.

### Kein neues Modell nötig

Der Upload-Flow erzeugt je Datei: 1 Variant + 1 Track — passt ins bestehende Schema.

---

## ID3-Felder-Mapping

| ID3-Tag | Ziel | Bedingung |
|---|---|---|
| `title` | Variant `name` | Fallback: Dateiname ohne Extension |
| `USLT` (Lyrics) | Datei → `lyricsPath` | Nur wenn Modus "Aus ID3" |
| `genre` | Projekt `genre` | Nur wenn Feld noch leer |
| `bpm` | Projekt `bpm` | Nur wenn Feld noch leer |
| `comment` | – | Ignoriert |

---

## Projekt-Erstellungsformular

Neuer Modus-Schalter im "Neues Projekt"-Dialog:

```
Projektname: [_________________]

○ Leeres Projekt (Upload/Manuell)
● KI-Projekt (bisheriger Flow mit Genre, Mood, etc.)
```

"Leeres Projekt": nur Name Pflicht → Projekt mit `status: "draft"`, Genre/Mood leer → Redirect zur Projektseite.

---

## UI: Upload-Modal

Trigger: Button "⬆ Varianten hochladen" in der Projektseite, neben "✨ Variante generieren".

**Schritte im Modal:**

1. **Drag & Drop Zone** — MP3, WAV, M4A, mehrere Dateien gleichzeitig
2. **Vorschau-Tabelle** (client-seitig, sofort nach Dateiauswahl via `music-metadata` Browser-Bundle):

   | Dateiname | Variantenname | Lyrics-Modus | |
   |---|---|---|---|
   | cosmic_v1.mp3 | Cosmic V1 | `● Aus ID3` | ✕ |
   | acoustic.mp3 | Acoustic Demo | `○ Instrumental ● KI ○ Manuell` | ✕ |

3. Lyrics-Modus-Optionen pro Zeile:
   - **Aus ID3** — sichtbar nur wenn USLT-Tag vorhanden
   - **Instrumental** — Track `isInstrumental: true`, kein `lyricsPath`
   - **KI extrahiert** — Gemini transkribiert Audio async
   - **Manuell** — Textarea öffnet sich inline

4. **"Importieren"-Button** → Submit

---

## API

### `POST /api/projects/[id]/import-tracks`

Empfängt: `multipart/form-data`
- Audiodateien
- `metadata` JSON: `[{ filename, variantName, lyricsMode, manualLyrics? }]`

Pro Datei:
1. Speichert File → `storage/projects/[slug]/uploads/[timestamp]-[name]`
2. Erstellt Variant (`status: "importing"`, `sourceType: "upload"`)
3. Erstellt Track (`isInstrumental`, `lyricsSource`)
4. Schreibt Lyrics-Datei wenn Modus `id3` oder `manual`
5. Queued Job `analyze-imported-track`

Antwort: `{ variantIds: string[] }` — UI startet Polling sofort.

---

## Worker-Job: `analyze-imported-track`

```ts
payload: {
  trackId: string
  variantId: string
  filePath: string
  extractLyrics: boolean  // true wenn Modus "KI extrahiert"
}
```

**Ablauf:**
1. Librosa-Analyse → BPM, Key, Sections
2. `analyzeTrackWithAI()` → Scores + Struktur + `suggestedVersionName`
3. Wenn `extractLyrics: true` → Gemini-Transkription → Lyrics-Datei schreiben → Variant `lyricsPath` setzen
4. Track + Variant mit Scores updaten
5. Variant `status → "completed"`

Das bestehende 5s-Polling stoppt automatisch wenn alle Varianten `completed`.

---

## Sidebar-Anzeige (Fortschritt)

Neue Status-Labels für Upload-Varianten:

```
● Wird importiert...
● KI analysiert...
● Fertig ✓  [KI empfiehlt: "Cinematic Club Mix"]
```

Der KI-Namensvorschlag (`suggestedVersionName`) erscheint als Badge neben dem Variantennamen nach Abschluss.

---

## Abhängigkeiten / neue Pakete

- `music-metadata` — ID3-Extraktion server-seitig (Node.js, bereits in vielen Next.js-Projekten vorhanden)
- `music-metadata/browser` — client-seitig für Vorschau-Tabelle (lightweight, kein Wasm)

---

## Offene Punkte / spätere Erweiterung

- Whisper als Alternative zu Gemini für Lyrics-Transkription (präziser, aber extra API-Key)
- Direkt aus Projekt-Detail: weiterer "+" Button an Varianten um neue Suno-Variante zu triggern (separates Feature, nicht Teil dieses Specs)
