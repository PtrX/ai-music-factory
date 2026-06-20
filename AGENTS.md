# AI Music Factory — Agent Instructions

---

## 🔍 AKTUELLE AUFGABE: Umfassender Multi-Agent QA

> **Lies `HANDOFF.md` zuerst** — dort steht was bereits gefixt wurde.

### Ziel
Führe einen vollständigen QA-Durchlauf durch. Finde und fixe alle verbleibenden Bugs bevor der E2E-Test stattfindet.

### Methode: Multi-Agent parallel

Starte mehrere unabhängige Sub-Agenten, die jeweils einen Bereich der Codebase scannen. Danach einen Fix-Agenten der alle Findings in einem Durchlauf anwendet.

---

### QA Bereiche

#### Agent 1 — Frontend Null-Safety & UX
Dateien: `app/(dashboard)/page.tsx`, `app/projects/new/page.tsx`, `app/projects/[id]/page.tsx`, `components/project-form.tsx`, `components/rating-form.tsx`, `components/copy-button.tsx`

Prüfe auf:
- `data.x` ohne `?? []` / `?? null` / `?? {}` nach fetch-Calls
- `.map()`, `.filter()`, `.length` auf Werte die undefined sein könnten
- `try/catch` die Fehler nur in die Konsole loggen ohne UI-Feedback
- `router.push()` zu Seiten die crashen könnten
- States die nach einem fehlgeschlagenen API-Call undefined werden

#### Agent 2 — API Routes Korrektheit
Dateien: alle `app/api/**/*.ts`

Prüfe auf:
- Fehlende Pflichtfeld-Validierung (title, language, genre, mood)
- Prisma-Fehler die nicht korrekt als 500 behandelt werden
- Falsche HTTP-Status-Codes (z.B. 200 statt 201 bei POST)
- Fehlende 404-Behandlung wenn Prisma `null` zurückgibt
- `params.id` der undefined sein könnte
- `parseInt()` / `Number()` auf Strings ohne NaN-Check
- Race Conditions bei Slug-Generierung

#### Agent 3 — Worker Stabilität
Dateien: `worker/index.ts`, `lib/queue/index.ts`, `lib/storage/index.ts`

Prüfe auf:
- `setInterval` ohne unhandled-Promise-Rejection-Schutz (ein Crash killt den Worker)
- Jobs die ewig laufen ohne Timeout-Limit
- Fehlende `try/catch` in async Job-Handlern
- Falsches Payload-Parsing (JSON.parse ohne try/catch)
- `variant.project` das null sein könnte nach include
- Dateipfade die auf nicht-existente Verzeichnisse zeigen

#### Agent 4 — LLM Generator Robustheit
Dateien: `lib/generators/lyrics.ts`, `lib/generators/suno-prompt.ts`

Prüfe auf:
- Leerer `OPENROUTER_API_KEY` (kein frühzeitiger Fehler)
- `response.choices[0]` das undefined sein könnte (leere API-Antwort)
- Negative-Prompt-Parsing das bei unerwarteter LLM-Ausgabe leer bleibt
- Null-Werte bei `bpm`, `vocalType` die zu schlechten Prompts führen
- Fehlende Retry-Logik bei API-Fehlern

#### Agent 5 — TypeScript & Build
Führe aus:
```bash
npm run typecheck
npm run build 2>&1 | head -50
```
Fixe alle TypeScript-Fehler. Reportiere Build-Warnings.

---

### Fix-Regeln

- Lies jede Datei vor dem Bearbeiten (Read tool)
- Minimale Änderungen — kein Refactoring
- Keine neuen Features
- Nach allen Fixes: `npm run typecheck` muss sauber durchlaufen

---

### E2E-Test (nach QA-Fixes)

Teste manuell diesen Flow:

```
1. http://localhost:3000 → Dashboard lädt ohne Fehler
2. "New Project" → Preset "Russian Epic Afro Deep House" laden
3. Titel eingeben → "Create Project" → landet auf Projektseite
4. "Generate All Variants" klicken
5. Worker-Log beobachten (Terminal [1])
6. Nach ~30s Seite neu laden → Tabs A-E haben Lyrics + Suno Prompt
7. Copy-Button klicken → Text landet in Clipboard
8. Rating-Sliders bedienen → Speichern → Scores erscheinen
9. "Favorite" klicken → Status wechselt zu "selected"
10. Dashboard → Projekt mit Score sichtbar
```

Wenn ein Schritt fehlschlägt: Issue dokumentieren in `HANDOFF.md`.

---

### Wenn fertig

Schreibe `HANDOFF.md` neu mit:
- Was du gefixt hast
- Was noch offen ist
- E2E-Test-Ergebnis
- Bekannte Limits

---

## ORIGINAL IMPLEMENTIERUNGS-SPEC (Referenz)

Implementiere **MVP Phase 1** der AI Music Factory als vollständige, lauffähige Web-App.

Der vollständige Design-Spec liegt hier:
`docs/superpowers/specs/2026-06-17-ai-music-factory-design.md`

**Lies diese Datei zuerst, bevor du anfängst.**

---

## Stack (bereits entschieden, nicht ändern)

- **Framework:** Next.js 14 mit App Router + TypeScript (strict mode)
- **Datenbank:** SQLite via Prisma ORM
- **Job Queue:** Interne SQLite-backed Queue (kein Redis, kein BullMQ)
- **LLM:** Anthropic Claude API direkt (`@anthropic-ai/sdk`)
- **Music Provider:** Abstraktes Interface — MockProvider default
- **Styling:** Tailwind CSS + shadcn/ui
- **Worker:** Separater Node.js Prozess (`worker/index.ts`)

---

## MVP Phase 1 — Was du baust

1. Projekt anlegen (Formular → DB → Ordnerstruktur)
2. Lyrics + Suno-Prompts für alle 5 Varianten via Claude generieren
3. Copy-Buttons für alle Text-Outputs
4. Varianten-Verwaltung (Status, Rating 1–10)
5. MockProvider (gibt nach 3s Fake-Audio zurück)

**Phase 2 ist NICHT deine Aufgabe:** GenericHttpSunoProvider, Telegram Bot, ZIP Export, Rating Dashboard — lass Platzhalter/TODOs, implementiere sie nicht.

---

## Projektstruktur — genau so anlegen

```
ai-music-factory/
├── app/
│   ├── (dashboard)/
│   │   └── page.tsx
│   ├── projects/
│   │   ├── new/
│   │   │   └── page.tsx
│   │   └── [id]/
│   │       └── page.tsx
│   └── api/
│       ├── projects/
│       │   └── route.ts
│       ├── projects/[id]/
│       │   └── route.ts
│       ├── projects/[id]/generate/
│       │   └── route.ts
│       ├── variants/[id]/rating/
│       │   └── route.ts
│       ├── variants/[id]/status/
│       │   └── route.ts
│       ├── variants/[id]/files/
│       │   └── route.ts
│       └── presets/
│           └── route.ts
├── worker/
│   └── index.ts
├── lib/
│   ├── db/
│   │   └── index.ts              # Prisma Client singleton
│   ├── queue/
│   │   └── index.ts              # enqueue / dequeue / markDone / markFailed
│   ├── providers/
│   │   └── music/
│   │       ├── interface.ts      # MusicGenerationProvider interface + types
│   │       ├── mock.ts           # MockProvider
│   │       └── index.ts          # Factory: lädt Provider via MUSIC_PROVIDER env
│   ├── generators/
│   │   ├── lyrics.ts             # Claude → Lyrics Markdown
│   │   └── suno-prompt.ts        # Claude → Style Prompt + Negative Prompt
│   └── storage/
│       └── index.ts              # Projektordner anlegen, Dateien schreiben/lesen
├── components/
│   ├── ui/                       # shadcn/ui Komponenten
│   ├── project-form.tsx
│   ├── variant-tabs.tsx
│   ├── rating-form.tsx
│   └── copy-button.tsx
├── prisma/
│   ├── schema.prisma
│   └── seed.ts                   # Preset "Russian Epic Afro Deep House"
├── storage/
│   └── projects/                 # Gitignored, hier landen Projektordner
├── .env.example
├── .env.local                    # Nicht committen
├── .gitignore
├── docker-compose.yml
├── package.json
└── README.md
```

---

## Datenbankschema (Prisma)

```prisma
model Project {
  id           String    @id @default(cuid())
  slug         String    @unique
  title        String
  language     String
  genre        String
  mood         String
  vibe         String
  bpm          Int?
  vocalType    String?
  songLength   String?
  variantCount Int       @default(5)
  status       String    @default("draft")
  folderPath   String
  createdAt    DateTime  @default(now())
  updatedAt    DateTime  @updatedAt
  variants     Variant[]
}

model Variant {
  id             String   @id @default(cuid())
  projectId      String
  label          String   // A | B | C | D | E
  name           String
  lyricsPath     String?
  sunoPromptPath String?
  negativePrompt String?
  audioPath      String?
  status         String   @default("draft")
  scoreHook      Int?
  scoreVocal     Int?
  scoreBeat      Int?
  scoreEmotion   Int?
  scoreRemix     Int?
  scoreTikTok    Int?
  scoreTotal     Int?
  notes          String?
  createdAt      DateTime @default(now())
  project        Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  jobs           Job[]
}

model Job {
  id          String    @id @default(cuid())
  variantId   String?
  type        String    // generate_lyrics | generate_prompt | music_api
  status      String    @default("pending")
  attempts    Int       @default(0)
  lastError   String?
  payload     String    // JSON string
  result      String?   // JSON string
  createdAt   DateTime  @default(now())
  processedAt DateTime?
  variant     Variant?  @relation(fields: [variantId], references: [id])
}

model Preset {
  id             String   @id @default(cuid())
  name           String
  genre          String
  mood           String
  vibe           String?
  bpm            Int?
  vocalType      String?
  sunoStyle      String
  negativePrompt String
  createdAt      DateTime @default(now())
}
```

Status-Werte für Variant:
`draft | prompt_ready | queued | generating | completed | failed | reviewed | selected | published`

---

## Music Provider Interface

```typescript
// lib/providers/music/interface.ts

export interface SongInput {
  title: string
  stylePrompt: string
  negativePrompt: string
  lyrics?: string
  duration?: number
}

export type JobStatus = {
  id: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  progress?: number
}

export type AudioFile = {
  filename: string
  url?: string
  buffer?: Buffer
}

export interface MusicGenerationProvider {
  createSong(input: SongInput): Promise<{ jobId: string }>
  getStatus(jobId: string): Promise<JobStatus>
  downloadResult(jobId: string): Promise<AudioFile[]>
}
```

MockProvider: wartet 3 Sekunden, gibt `{ filename: 'mock.mp3', buffer: <leer> }` zurück.

Provider-Selektion via ENV:
```
MUSIC_PROVIDER=mock   # default
MUSIC_PROVIDER=generic-http
```

---

## Job Queue

```typescript
// lib/queue/index.ts

export async function enqueue(type: string, variantId: string, payload: object): Promise<Job>
export async function dequeue(): Promise<Job | null>   // holt ältesten pending Job, setzt status=processing
export async function markDone(jobId: string, result: object): Promise<void>
export async function markFailed(jobId: string, error: string): Promise<void>
```

- `dequeue()` in einer Transaktion ausführen (Prisma `$transaction`)
- Max. 3 Versuche pro Job, dann `failed`

---

## Worker (`worker/index.ts`)

```typescript
// Startup: alle Jobs mit status='processing' → status='pending' (crash recovery)
// setInterval alle 5000ms:
//   job = await dequeue()
//   if (!job) return
//   switch job.type:
//     case 'generate_lyrics':  → generators/lyrics.ts → Datei schreiben → Variant.lyricsPath + status='prompt_ready'
//     case 'generate_prompt':  → generators/suno-prompt.ts → Datei schreiben → Variant.sunoPromptPath + status='prompt_ready'
//     case 'music_api':        → MusicProvider.createSong() → MockProvider → audio speichern → status='completed'
```

---

## Claude Generators

### lyrics.ts
System Prompt (Englisch):
- Erstelle originale, rechtlich unbedenkliche Lyrics
- Kopiere niemals geschützte Originaltexte
- Songstruktur: `[Intro] [Verse 1] [Pre-Chorus] [Chorus] [Drop Hook] [Verse 2] [Final Chorus] [Outro]`
- Charakter-Modifier pro Variante:
  - A: emotional & cinematic, storytelling-fokussiert
  - B: clubbiger & tanzbarer, repetitiver Hook
  - C: organischer, poetischer, naturverbunden
  - D: dunkler, hypnotischer, mystischer
  - E: kommerzieller Radio/TikTok-Hook, eingängig, kurz

Output-Sprache = `project.language`

### suno-prompt.ts
System Prompt: Erzeuge strukturierten Style Prompt für Suno-kompatible APIs.
Format:
```
Genre: ...
Mood: ...
Vocals: ...
Production: ...
Arrangement: ...
Negative Prompt: ...
```
Keine Formulierungen wie "im exakten Stil von [Künstler]" — nur allgemeine Vibes.
Auch einmalig `cover-prompt.md` generieren (visueller Cover-Art Prompt basierend auf Mood/Vibe/Genre).

---

## Projektordner-Struktur

Beim Anlegen eines Projekts automatisch erstellen:

```
storage/projects/YYYY-MM-DD_slug/
  project.json
  lyrics/
    version-a.md
    version-b.md
    version-c.md
    version-d.md
    version-e.md
  prompts/
    suno-version-a.md
    suno-version-b.md
    suno-version-c.md
    suno-version-d.md
    suno-version-e.md
    cover-prompt.md
  outputs/
    audio/
    covers/
  notes.md
  publish/
    youtube-description.md
    tiktok-caption.md
    instagram-caption.md
```

Slug-Format: `title.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')`

---

## Frontend

**Dashboard (`/`):**
- Tabelle: Titel, Genre, Datum, Status, Varianten, beste Bewertung
- "Neues Projekt" Button

**Neues Projekt (`/projects/new`):**
- Formular: title, language, genre, mood, vibe, bpm, vocalType, songLength, variantCount
- Preset-Dropdown (füllt Formular vor)
- Submit → POST /api/projects → redirect zu /projects/[id]

**Projektdetail (`/projects/[id]`):**
- Links: Projektinfo + "Alle Varianten generieren" Button (startet Jobs)
- Rechts: Tabs A / B / C / D / E
- Pro Tab:
  - Status Badge
  - Lyrics (Markdown gerendert) + Copy Button
  - Suno Prompt + Copy Button
  - Negative Prompt + Copy Button
  - `<audio controls>` (wenn audioPath vorhanden)
  - Bewertungs-Sliders (scoreHook, scoreVocal, scoreBeat, scoreEmotion, scoreRemix, scoreTikTok) + Notiz
  - Buttons: ⭐ Als Favorit / 🗑 Verwerfen

---

## ENV Variablen

Referenz: `.env.example`

```
# LLM
ANTHROPIC_API_KEY=

# Music Provider
MUSIC_PROVIDER=mock
SUNO_PROVIDER_BASE_URL=
SUNO_PROVIDER_API_KEY=
SUNO_PROVIDER_CREATE_ENDPOINT=/api/generate
SUNO_PROVIDER_STATUS_ENDPOINT=/api/status
SUNO_PROVIDER_DOWNLOAD_ENDPOINT=/api/download

# Database
DATABASE_URL=file:./dev.db

# Telegram (optional, Phase 2)
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

**Wichtig:** Kein API Key darf im Frontend-Bundle landen. Alle sensitiven Keys nur server-side verwenden.

---

## package.json Scripts

```json
{
  "scripts": {
    "dev": "next dev",
    "dev:worker": "tsx watch worker/index.ts",
    "dev:all": "concurrently \"npm run dev\" \"npm run dev:worker\"",
    "build": "next build",
    "start": "next start",
    "db:migrate": "prisma migrate dev",
    "db:seed": "tsx prisma/seed.ts",
    "db:studio": "prisma studio",
    "typecheck": "tsc --noEmit"
  }
}
```

---

## Docker Compose

```yaml
version: '3.8'
services:
  app:
    build: .
    ports:
      - "3000:3000"
    volumes:
      - ./storage:/app/storage
      - ./dev.db:/app/dev.db
    env_file: .env.local

  worker:
    build: .
    command: node dist/worker/index.js
    volumes:
      - ./storage:/app/storage
      - ./dev.db:/app/dev.db
    env_file: .env.local
    depends_on:
      - app
```

---

## Seed-Preset

`prisma/seed.ts` legt an:

```
Name: Russian Epic Afro Deep House
Genre: Afro Deep House, Melodic Afro House, Organic House
Mood: Epic, nostalgic, emotional, cinematic, spiritual, uplifting
Vibe: Keinemusik, Black Coffee, organic, warm, festival at sunset
BPM: 123
VocalType: Deep emotional male vocals, warm baritone
SunoStyle: Epic Russian Afro Deep House, melodic afro house, organic percussion,
  deep emotional male vocals, warm baritone, cinematic strings, acoustic guitar
  accents, tribal drums, deep sub bass, sunset festival mood, spiritual,
  nostalgic, heroic, uplifting, premium club production, 123 BPM
NegativePrompt: No big-room EDM, no dubstep, no aggressive synths, no cheesy
  dance-pop, no robotic vocals, no trap beat, no lo-fi mix
```

---

## Sicherheit & Rechtliches

- Claude System Prompts verbieten explizit das Kopieren geschützter Lyrics
- Suno-Prompts verwenden nur Mood/Vibe/Genre-Descriptoren, kein "im Stil von exakt [Künstler X]"
- Alle API Keys nur server-side, nie im Frontend Bundle
- `storage/` und `.env.local` in `.gitignore`

---

## Verifikation vor Abgabe

Führe folgendes aus und behebe alle Fehler:

```bash
npx tsc --noEmit          # Keine TypeScript Fehler
npx prisma validate       # Schema valide
npm run dev:all            # App startet ohne Fehler
```

Teste manuell:
1. Neues Projekt anlegen (Formular absenden)
2. "Alle Varianten generieren" klicken
3. Warten bis Jobs durchlaufen (Worker)
4. Lyrics und Suno Prompt in Tab A sichtbar + Copy-Button funktioniert
5. Rating speichern

---

## Wenn du fertig bist

Schreibe `HANDOFF.md` mit:
- Was implementiert wurde
- Was noch fehlt (Phase 2 Items)
- Bekannte Issues oder TODOs
- Wie man die App startet
- Letzte Befehle zum Starten

Schreibe `AGENTS.md` nicht neu — diese Datei bleibt als Referenz erhalten.
