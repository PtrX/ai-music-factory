# Agent Task: Audio → Style Preset → Neues Projekt (Phase 1 MVP)

**Projekt:** AI Music Factory  
**Stack:** Next.js 14 App Router · TypeScript · SQLite + Prisma ORM · Tailwind · shadcn/ui  
**Reviewer:** Peter Rempel — Review ab ~15:00  
**Ziel:** Audio-Datei hochladen → analysieren → als wiederverwendbaren Suno-Preset speichern → beim Neues-Projekt-Dialog als Vorlage auswählbar

---

## Was bereits existiert — NICHT anfassen

- `lib/librosa-analysis.ts` — Node.js wrapper für Python-Skript
- `scripts/analyze_audio.py` — librosa-Analyse (BPM, Key, Sections, TikTok-Fenster)
- `lib/ai-rating.ts` — Gemini Audio-Analyse (Hybrid-Modus mit librosa-Constraints)
- `prisma/schema.prisma` — Schema (Vorsicht: migrations funktionieren nicht, nur sqlite3 direkt)
- `storage/` — Ablageort für alle Projektdateien
- `app/api/tracks/[id]/analyze/route.ts` — Analyse-Route als Referenz-Implementierung
- Alle bestehenden Projekt/Track/Variant-Routen

---

## Aktueller DB-Stand

Die `Preset`-Tabelle **existiert bereits** in `prisma/dev.db` mit diesen Spalten:
```sql
id, name, genre, mood, vibe, bpm, vocalType, sunoStyle, negativePrompt, createdAt
```

Diese Spalten müssen **hinzugefügt** werden (via `sqlite3 prisma/dev.db "ALTER TABLE..."` — NICHT prisma migrate):
```sql
ALTER TABLE "Preset" ADD COLUMN "sourceAudioPath" TEXT;
ALTER TABLE "Preset" ADD COLUMN "sourceType" TEXT NOT NULL DEFAULT 'upload';
ALTER TABLE "Preset" ADD COLUMN "subgenre" TEXT;
ALTER TABLE "Preset" ADD COLUMN "keySignature" TEXT;
ALTER TABLE "Preset" ADD COLUMN "language" TEXT NOT NULL DEFAULT 'instrumental';
ALTER TABLE "Preset" ADD COLUMN "energy" TEXT;
ALTER TABLE "Preset" ADD COLUMN "bpmRange" TEXT;
ALTER TABLE "Preset" ADD COLUMN "instruments" TEXT;
ALTER TABLE "Preset" ADD COLUMN "productionStyle" TEXT;
ALTER TABLE "Preset" ADD COLUMN "similarArtists" TEXT;
ALTER TABLE "Preset" ADD COLUMN "structureJson" TEXT;
ALTER TABLE "Preset" ADD COLUMN "usageCount" INTEGER NOT NULL DEFAULT 0;
```

Und `Project` braucht eine optionale Preset-Referenz:
```sql
ALTER TABLE "Project" ADD COLUMN "presetId" TEXT REFERENCES "Preset"("id") ON DELETE SET NULL;
```

---

## prisma/schema.prisma — Ergänzungen

Das bestehende `Preset`-Modell im Schema durch dieses ersetzen:

```prisma
model Preset {
  id               String    @id @default(cuid())
  name             String
  sourceAudioPath  String?
  sourceType       String    @default("upload")
  genre            String
  subgenre         String?
  mood             String
  vibe             String?
  energy           String?
  bpm              Int?
  bpmRange         String?
  keySignature     String?
  language         String    @default("instrumental")
  vocalType        String?
  sunoStyle        String
  negativePrompt   String    @default("")
  instruments      String?
  productionStyle  String?
  similarArtists   String?
  structureJson    String?
  usageCount       Int       @default(0)
  createdAt        DateTime  @default(now())
  projects         Project[]
}
```

Und im `Project`-Modell hinzufügen:
```prisma
presetId  String?
preset    Preset?  @relation(fields: [presetId], references: [id], onDelete: SetNull)
```

Danach: `npx prisma generate` (damit der TypeScript-Client aktualisiert wird).  
**NICHT** `prisma migrate` ausführen — Schema bereits via sqlite3 geändert.

---

## Neue Datei: `lib/preset-analyzer.ts`

Analysiert eine Audiodatei und erstellt einen Preset-Datensatz.  
Verwendet librosa + Gemini Audio (gleiche Infrastruktur wie Track-Analyse).

```typescript
import { analyzeAudioLocally, LibrosaResult } from "./librosa-analysis"
import * as fs from "fs/promises"
import * as path from "path"

export interface PresetAnalysis {
  name: string
  genre: string
  subgenre: string | null
  mood: string
  vibe: string
  energy: string
  bpm: number | null
  bpmRange: string | null
  keySignature: string | null
  language: string
  vocalType: string | null
  sunoStyle: string           // fertiger Suno-Prompt
  negativePrompt: string
  instruments: string[]
  productionStyle: string
  similarArtists: string[]
  structureJson: string | null // librosa-Sections als JSON-String
}

export async function analyzeAudioForPreset(
  filePath: string
): Promise<PresetAnalysis | null>
```

**Implementierungshinweis:**  
1. Erst `analyzeAudioLocally(filePath)` aufrufen → `librosaData`
2. Dann Gemini mit einem **Style-spezifischen Prompt** aufrufen (NICHT der Track-Rating-Prompt)
3. Der Gemini-Prompt für Presets (in `buildStylePrompt`):

```
You are a music producer and Suno AI expert.
Listen to this audio track carefully.

Librosa measured (use these as ground truth):
- BPM: {bpm}, Key: {key}, Duration: {duration}s

Your task: Reverse-engineer the production style to create a Suno AI style prompt.

Return SINGLE JSON (no markdown):
{
  "name": "<short memorable preset name, max 5 words, e.g. 'Afro Deep House Epic'>",
  "genre": "<primary genre>",
  "subgenre": "<specific subgenre or null>",
  "mood": "<2-3 mood adjectives, comma-separated>",
  "vibe": "<2-3 vibe adjectives, comma-separated>",
  "energy": "<low|medium|high|peak>",
  "bpmRange": "<e.g. '115-125' or null>",
  "language": "<detected vocal language or 'instrumental'>",
  "vocalType": "<e.g. 'male, deep, melodic' or null if instrumental>",
  "instruments": ["<detected instruments>"],
  "productionStyle": "<production characteristics, e.g. 'cinematic, layered, atmospheric'>",
  "similarArtists": ["<1-3 similar artists>"],
  "sunoStyle": "<complete Suno-compatible style prompt ready to use, e.g. 'Afro Deep House, 120 BPM, cinematic, epic, warm bass, flute melody, tribal percussion, emotional'>",
  "negativePrompt": "<what to avoid, e.g. 'lo-fi, distorted, harsh, rap, trap'>"
}
```

Gemini-Call: gleiche Methode wie in `lib/ai-rating.ts` (`callGeminiDirect` als Referenz).  
Antwort-Parsing: gleiche JSON-Extraktion via regex `content.match(/\{[\s\S]*\}/)`.

---

## Neue API-Routen

### `app/api/presets/from-audio/route.ts`

`POST` — empfängt multipart/form-data mit einem `audio`-File-Feld.

Ablauf:
1. Datei in `storage/presets/uploads/[timestamp]-[originalname]` speichern (Ordner anlegen wenn nötig)
2. `analyzeAudioForPreset(filePath)` aufrufen
3. `prisma.preset.create({...})` mit den Analyse-Ergebnissen
4. `{ preset }` zurückgeben

```typescript
import { NextRequest, NextResponse } from "next/server"
import * as path from "path"
import * as fs from "fs/promises"
import { prisma } from "@/lib/db"
import { analyzeAudioForPreset } from "@/lib/preset-analyzer"

export async function POST(req: NextRequest) {
  const formData = await req.formData()
  const file = formData.get("audio") as File | null
  if (!file) return NextResponse.json({ error: "No audio file" }, { status: 400 })

  // Supported MIME types
  const allowed = ["audio/mpeg", "audio/mp3", "audio/wav", "audio/x-wav", "audio/mp4", "audio/m4a", "audio/ogg"]
  if (!allowed.includes(file.type) && !file.name.match(/\.(mp3|wav|m4a|ogg|flac)$/i)) {
    return NextResponse.json({ error: "Unsupported file type" }, { status: 400 })
  }

  // Save to disk
  const uploadDir = path.join(process.cwd(), "storage/presets/uploads")
  await fs.mkdir(uploadDir, { recursive: true })
  const filename = `${Date.now()}-${file.name.replace(/[^a-z0-9.-]/gi, "_")}`
  const filePath = path.join(uploadDir, filename)
  const buffer = Buffer.from(await file.arrayBuffer())
  await fs.writeFile(filePath, buffer)

  // Analyze
  const analysis = await analyzeAudioForPreset(filePath)
  if (!analysis) return NextResponse.json({ error: "Analysis failed" }, { status: 500 })

  // Save preset
  const preset = await prisma.preset.create({
    data: {
      name: analysis.name,
      sourceAudioPath: `presets/uploads/${filename}`,
      sourceType: "upload",
      genre: analysis.genre,
      subgenre: analysis.subgenre,
      mood: analysis.mood,
      vibe: analysis.vibe,
      energy: analysis.energy,
      bpm: analysis.bpm,
      bpmRange: analysis.bpmRange,
      keySignature: analysis.keySignature,
      language: analysis.language,
      vocalType: analysis.vocalType,
      sunoStyle: analysis.sunoStyle,
      negativePrompt: analysis.negativePrompt,
      instruments: JSON.stringify(analysis.instruments),
      productionStyle: analysis.productionStyle,
      similarArtists: JSON.stringify(analysis.similarArtists),
      structureJson: analysis.structureJson,
    },
  })

  return NextResponse.json({ preset })
}
```

### `app/api/presets/route.ts`

`GET` — Liste aller Presets, sortiert nach `usageCount DESC, createdAt DESC`.  
Felder zurückgeben: id, name, genre, subgenre, mood, vibe, bpm, keySignature, language, sunoStyle, usageCount, createdAt.

### `app/api/presets/[id]/route.ts`

- `GET` — Preset-Details + verknüpfte Projekte (Anzahl)
- `PATCH` — Felder editieren (name, sunoStyle, negativePrompt, mood, vibe, genre)
- `DELETE` — Löschen (nur wenn `usageCount === 0`)

---

## UI-Änderungen

### 1. Neue Seite: `app/presets/page.tsx`

Preset-Bibliothek. Zeigt alle Presets als Karten.  
Jede Karte: Name, Genre, BPM, Key, Mood, "X Projekte".  
Aktionen: "Projekt starten" → öffnet Neues-Projekt-Dialog mit vorausgefüllten Daten.  
Header-Button: "Preset aus Audio" → öffnet Upload-Dialog.

### 2. Upload-Dialog: `components/preset-upload-dialog.tsx`

Ein `Dialog` (shadcn/ui) mit:
- Drag & Drop Zone (oder File-Input) für Audio-Dateien
- Unterstützte Formate anzeigen: MP3, WAV, M4A
- Während Analyse: Spinner + "Analysiere... (~20s)"
- Nach Analyse: Preset-Vorschau (alle Felder editierbar)
- Buttons: "Speichern" und "Direkt Projekt starten"

Fetch-Aufruf:
```typescript
const formData = new FormData()
formData.append("audio", file)
const res = await fetch("/api/presets/from-audio", { method: "POST", body: formData })
```

**WICHTIG:** Kein `Content-Type` Header setzen — Browser setzt ihn automatisch mit boundary.

### 3. Erweiterung "Neues Projekt" Dialog

In `app/page.tsx` (oder wo der Projekt-Erstellungs-Dialog ist): Tab "Aus Preset" hinzufügen.

Tab-Inhalt: Preset-Liste (kompakt), Klick → füllt Formular-Felder vor:
- genre ← preset.genre
- mood ← preset.mood  
- vibe ← preset.vibe
- bpm ← preset.bpm
- vocalType ← preset.vocalType

Beim Absenden: `presetId` mitschicken → API-Route inkrementiert `usageCount`.

### 4. Navigation

In `app/layout.tsx` oder der Navbar: Link "Presets" hinzufügen.

---

## Bestehende Patterns — als Referenz verwenden

**Prisma-Queries:** Siehe `app/api/projects/route.ts` oder `app/api/variants/[id]/tracks/route.ts`  
**Route-Struktur:** Alle Routen in `app/api/` folgen dem gleichen Muster  
**UI-Komponenten:** shadcn/ui — Button, Card, Badge, Dialog, Tabs, Input  
**File Storage:** `lib/storage.ts` → `writeFile(folderPath, relativePath, content)`  
**Prisma Client:** Import von `@/lib/db` → `import { prisma } from "@/lib/db"`

---

## Reihenfolge der Implementierung

1. **DB-Migration** ausführen (sqlite3 ALTER TABLE-Befehle oben)
2. **`prisma generate`** ausführen
3. **`lib/preset-analyzer.ts`** schreiben und lokal testen
4. **`app/api/presets/from-audio/route.ts`** implementieren
5. **`app/api/presets/route.ts`** und **`[id]/route.ts`** implementieren
6. **`app/presets/page.tsx`** — Preset-Liste
7. **`components/preset-upload-dialog.tsx`** — Upload + Analyse UI
8. **Neues-Projekt-Dialog** um Preset-Tab erweitern

---

## Testen

Nach Implementierung:
```bash
# Direkt testen ob Analyse funktioniert:
curl -X POST http://localhost:3000/api/presets/from-audio \
  -F "audio=@/pfad/zu/test.mp3"

# Preset-Liste:
curl http://localhost:3000/api/presets
```

Erwartetes Ergebnis: Preset mit korrekten BPM, Key, Genre, und fertigem sunoStyle-Prompt.

---

## Was der Reviewer prüft

- [ ] Upload einer MP3 → Preset wird korrekt angelegt mit BPM/Key von librosa
- [ ] sunoStyle-Prompt ist direkt in Suno verwendbar (nicht zu generisch)
- [ ] Preset-Liste zeigt alle Presets
- [ ] "Aus Preset" im Neues-Projekt-Dialog füllt Felder vor
- [ ] usageCount wird bei Projekt-Erstellung inkrementiert
- [ ] Fehlerfall: falsches Dateiformat gibt klare Fehlermeldung
- [ ] Keine bestehenden Tests/Routen beschädigt

---

## Wichtige Hinweise

- **DATABASE_URL** in `.env.local`: `file:./dev.db` → löst zu `prisma/dev.db` auf
- **API-Keys** sind in `.env.local` — niemals in Code committen
- **`prisma migrate`** NICHT ausführen — nur sqlite3 direkt für Schema-Änderungen
- **Server-Neustart** nach `prisma generate` nötig (Next.js cached den Client in globalThis)
- Der Analyse-Prozess dauert ~20s (librosa 3s + Gemini 15s) — Timeout in der Route auf 120s setzen
- `next.config.js` prüfen ob API-Timeout konfiguriert werden muss
