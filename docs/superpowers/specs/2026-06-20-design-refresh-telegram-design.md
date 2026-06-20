# Design Refresh + Telegram Bot Ausbau — Spec
_Datum: 2026-06-20_

## Entscheidungen (aus Brainstorming)

| Dimension | Entscheidung |
|---|---|
| Design-Richtung | Studio Dark (tiefschwarz + Grün-Akzent, Pill-Shapes) |
| Layout | Sidebar + Main (B) |
| Umsetzungsstrategie | Integrierter Redesign in einem Zug (Ansatz 1) |
| Telegram-Tiefe | Voller Bot mit Commands + Inline-Keyboards (C) |

---

## 1. Design System (Open Design: Spotify-inspiriert, angepasst)

### Token-Set (`globals.css`)

Studio Dark ist eine eigenständige Palette — kein Spotify-Clone, aber mit derselben Tiefenschichtung:

```css
:root {
  /* Backgrounds */
  --background:    #0d0f0f;   /* Deepest — page bg */
  --surface:       #111414;   /* Nav, sidebar */
  --surface-raised:#151919;   /* Cards */
  --surface-high:  #1a2020;   /* Hover states */

  /* Borders */
  --border:        #1e2525;
  --border-subtle: #1a2020;

  /* Text */
  --foreground:    #e8f0ee;   /* Primary text */
  --muted-foreground: #3d5550; /* Muted / secondary */

  /* Accent — Studio Green (kein Spotify #1ed760, eigener Ton) */
  --accent:        #1db954;   /* Funktional: Play, Active, CTA, Score-high */
  --accent-bg:     #0a2a1a;   /* Akzent-Hintergrund für Badges */
  --accent-border: #1a4030;   /* Akzent-Border */

  /* Semantic */
  --destructive:   #e05555;
  --warning:       #f0a500;

  /* Radius */
  --radius:        0.4rem;    /* Standard cards/inputs */
  --radius-pill:   9999px;    /* Badges, score-pills, CTAs */
}
```

### Tailwind-Erweiterung (`tailwind.config.ts`)

Die neuen CSS-Variablen werden als Tailwind-Custom-Colors eingehängt. Keine hartcodierten Hex-Werte in Komponenten.

### Typografie

- **Font:** Inter (bleibt) — kein Wechsel nötig
- **Gewicht:** 700 für Titles/Scores, 400 für Body, kein Bold im UI-Chrome
- **Button-Labels:** `font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase` (Pill-Buttons)
- Keine Emoji-Icons in UI-Elementen — Lucide-SVG-Icons mit `currentColor`

### Anti-AI-Slop-Regeln (aus Open Design `craft/anti-ai-slop.md`)

- Kein Default-Tailwind-Indigo als Akzent — `--accent` ist `#1db954`
- Keine zweistufigen "Trust"-Gradienten auf dem Hero
- Keine Emoji als Feature-Icons in `<h*>` oder `<button>`
- Kein Rounded-Card mit farbigem Left-Border-Akzent
- Keine erfundenen Metriken

---

## 2. Layout (`app/layout.tsx`)

### Neue Struktur

```
<html>
  <body>
    <div class="app-shell">           ← flex-row, min-h-screen
      <Sidebar />                     ← w-[180px], flex-shrink-0
      <main class="app-main">         ← flex-1, overflow-hidden
        {children}
      </main>
    </div>
  </body>
</html>
```

### Sidebar-Komponente (`components/sidebar.tsx`)

- **Logo-Bereich:** Grüner Dot + "AI MUSIC FACTORY" in Caps
- **Navigation:** Projects / Presets / Settings — aktiver State: `bg-accent-bg text-accent`
- **Worker-Badge unten:** Pulsierender grüner Dot + "Worker running / N pending" — liest von `/api/system/status`
- **Breite:** 180px fixed, kein Collapse (Tool ist Desktop-only)
- **Hintergrund:** `--surface` (#111414), Border-Right: `--border`

### Entfernt

Die bestehende `<nav>` in `layout.tsx` fällt weg. `StatusBar`-Komponente wandert in den Sidebar-Worker-Badge.

---

## 3. Komponenten-Rebuild

### 3a. Dashboard (`app/(dashboard)/page.tsx`)

**Vorher:** Tabelle mit Zeilen  
**Nachher:** Karten-Liste mit vertikalen Project-Cards

Jede Project-Card enthält:
- Projekt-Icon (farbiges Gradient-Rechteck, generiert aus Slug-Hash)
- Titel + Genre + Track-Anzahl
- Score-Badge (Pill, grün)
- Max. 2 Track-Rows mit Waveform-Bar + Dauer + Track-Score (nur wenn Tracks vorhanden)
- Score-Pills (Hook / Vocal / Beat / TikTok) — nur beste Variante

### 3b. Neue `<ScorePill>` Komponente (`components/ui/score-pill.tsx`)

Ersetzt die ad-hoc Score-Darstellung im ganzen UI:
```tsx
<ScorePill label="HOOK" value={9} />  // pill-green wenn ≥7, pill-dim wenn <7
```

### 3c. Neue `<TrackRow>` Komponente (`components/track-row.tsx`)

Wiederverwendbar für Dashboard + Detailseite:
- Play-Button (Kreis, grünes Dreieck)
- Waveform-Bar (einfacher Progress-Div, kein Canvas)
- Dauer + Score

### 3d. Project-Detail-Page (`app/projects/[id]/page.tsx`)

- Layout bleibt zweispaltig (Sidebar schon durch Shell gegeben)
- Visual-Refresh: gleiche Token, gleiche Komponenten
- Edit-Dialog: kein Rewrite, nur Styling-Update

---

## 4. Telegram Bot — Neues Feature-Set

### 4a. Architektur

Der bestehende Webhook (`app/api/telegram/webhook/route.ts`) wird erweitert um:

1. **Callback-Query-Handler** — für Inline-Keyboard-Button-Presses (approve/reject/video)
2. **Neue Commands** — `/approve`, `/reject`, `/generate`
3. **Neue Notification-Typen** — `sendTrackCard()` mit Audio + Inline-Keyboard

### 4b. `lib/telegram.ts` — Neue Funktionen

```ts
sendTrackCard(track, project, variant)
// Schickt Audio-Datei + Inline-Keyboard mit:
// [✅ Approve] [❌ Reject]
// [🎬 Generate Video]
// Callback-Data: "approve:TRACK_ID", "reject:TRACK_ID", "video:TRACK_ID"

answerCallbackQuery(callbackQueryId, text)
// Bestätigt Button-Press mit Toast-Text

editMessageReplyMarkup(chatId, messageId, replyMarkup)
// Entfernt Buttons nach Aktion (verhindert Doppel-Klick)

sendStatusCard()
// Strukturierte Status-Nachricht mit Quick-Action-Buttons [/list] [/queue]
```

### 4c. Callback-Query-Handler

```
update.callback_query vorhanden?
  → parse data: "action:id"
  → switch action:
      "approve" → track.isApproved = true (PATCH /api/tracks/[id]/status)
      "reject"  → track.isRejected = true (PATCH /api/tracks/[id]/status)
      "video"   → VideoJob erstellen, in Queue stellen
  → answerCallbackQuery (Toast)
  → editMessageReplyMarkup (Buttons entfernen)
  → Bestätigungs-Nachricht senden
```

### 4d. Neue Bot-Commands (Ergänzung zu bestehenden)

| Command | Verhalten |
|---|---|
| `/approve TRACK_ID` | Direktes Approve per Text (ohne Button) |
| `/reject TRACK_ID` | Direktes Reject per Text |
| `/generate PROJECT_ID` | Startet Generierung für alle Varianten des Projekts |
| `/list` | Verbesserter Projektüberblick mit Inline-Buttons [Details] [Generate] |
| `/status` | Wie bisher, aber strukturierter + Quick-Action-Buttons |

### 4e. Worker-Integration — `sendTrackCard` Trigger

In `worker/index.ts`: nach erfolgreicher Track-Verarbeitung (Ende des `music_api`-Jobs) wird `sendTrackCard()` aufgerufen statt des bisherigen Plain-Text-Notifications.

### 4f. Datenschema-Erweiterung

Zwei neue Felder auf `Track`:
```prisma
isApproved  Boolean @default(false)
isRejected  Boolean @default(false)
```
- Migration per `prisma migrate dev`
- `PATCH /api/tracks/[id]/rating` nimmt `isApproved`/`isRejected` entgegen (oder separater Endpunkt `PATCH /api/tracks/[id]/status`)
- Approve setzt `isApproved = true`, Reject setzt `isRejected = true` — beide sind unabhängige Flags (ein Track kann nicht beides sein; der Handler stellt sicher, dass nur eines gesetzt wird)

---

## 5. Nicht in Scope

- Mobil-Responsive-Redesign (Tool ist Desktop-only)
- Dark/Light-Mode-Toggle (bleibt Dark-only)
- Animationen / Transitions (außer bestehende `tailwindcss-animate`)
- Telegram: Gruppen-Support oder Multi-User — bleibt Single-Chat
- Neue Seiten oder Features jenseits der oben genannten

---

## 6. Datei-Inventory

### Geändert

| Datei | Was ändert sich |
|---|---|
| `app/globals.css` | Kompletter Token-Swap auf Studio Dark |
| `tailwind.config.ts` | Custom Color-Mapping auf neue CSS-Vars |
| `app/layout.tsx` | Sidebar-Shell statt Top-Nav |
| `app/(dashboard)/page.tsx` | Karten-Layout statt Tabelle |
| `app/projects/[id]/page.tsx` | Visual-Refresh mit neuen Komponenten |
| `lib/telegram.ts` | `sendTrackCard()`, `answerCallbackQuery()`, `editMessageReplyMarkup()` |
| `app/api/telegram/webhook/route.ts` | Callback-Query-Handler + neue Commands |
| `worker/index.ts` | `sendTrackCard()` nach Track-Fertigstellung |
| `prisma/schema.prisma` | `isApproved Boolean @default(false)` auf Track |

### Neu

| Datei | Zweck |
|---|---|
| `components/sidebar.tsx` | Sidebar-Komponente |
| `components/track-row.tsx` | Wiederverwendbare Track-Zeile |
| `components/ui/score-pill.tsx` | Score-Badge-Komponente |
| `prisma/migrations/…` | Migration für `isApproved` |
