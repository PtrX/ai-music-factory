# AI Music Factory — verbindliche Release-Asset-Checkliste

Diese Checkliste ist ein **hartes Stop-Gate**. Sobald Peter sagt, dass ein
Track/Song veröffentlicht, released oder „rausgebracht“ werden soll, muss sie
**vor jeder Bild- oder Videogenerierung vollständig abgearbeitet werden**.

Ohne vollständig bestätigtes Gate: **nichts generieren**.

## Gate 1 — Release-Identität festlegen

- [ ] Exakter AMF-Track ist gewählt und mit Track-ID dokumentiert.
- [ ] Künstlername ist exakt `3AHAR`.
- [ ] Offizielle 3AHAR-Wortmarke und offizielles Sonnensignet sind als
  Referenzdateien ausgewählt.
- [ ] Exakter Songtitel ist final bestätigt, einschließlich kyrillischer
  Schreibweise, Groß-/Kleinschreibung und Punktuation.
- [ ] Der Titel ist identisch in Release-Datensatz, Cover, Canvas/Reel, Video,
  Thumbnail und allen Metadaten.

## Gate 2 — Pflichtinhalt jedes Release-Visuals

- [ ] Jedes Release-Visual enthält das offizielle `3AHAR`-Logo/Sonnensignet.
- [ ] Jedes Release-Visual enthält den exakten Songtitel.
- [ ] Logo und Songtitel sind permanent eingebrannt, gut lesbar und nicht
  optional.
- [ ] Bei Motion bleiben Logo und Songtitel in **jedem Frame** sichtbar,
  korrekt geschrieben, unverformt, unbeschnitten und stabil.
- [ ] Textlose Release-Bilder sind verboten: nicht generieren, nicht Peter
  zeigen, nicht als Entwurf/Kandidat speichern, nicht animieren, nicht als
  Startframe verwenden und nicht weiterverarbeiten.

## Gate 3 — verpflichtende Asset-Liste

- [ ] Streaming-Cover: `3000 × 3000`, RGB, offizielles Logo plus exakter
  Songtitel, kein Releasedatum, keine URL, kein CTA, keine Store-Logos.
- [ ] 9:16-Release-Visual: offizielles Logo plus exakter Songtitel.
- [ ] Spotify Canvas: `7,5 s`, 9:16, H.264, mindestens `720 × 1280`, ohne
  Audio/CTA/URL/Streaminglogos; Logo und Songtitel permanent in jedem Frame.
- [ ] Reel: gebrandete Loop mit permanentem Logo und Songtitel; CTA nur auf
  der separaten Endcard.
- [ ] YouTube-Video/Visualizer: permanentes Logo und Songtitel.
- [ ] YouTube-Thumbnail: `1920 × 1080`, offizielles Logo plus exakter
  Songtitel, kein Releasedatum.

## Gate 4 — Preflight vor jedem Generationsaufruf

Vor **jedem** Bild-/Video-Aufruf schriftlich gegenprüfen:

- [ ] Welche konkrete Pflichtdatei wird jetzt erzeugt?
- [ ] Welche offizielle Logo-/Signet-Referenz wird verwendet?
- [ ] Welcher exakte Songtitel muss sichtbar sein?
- [ ] Sind Logo und Titel im Prompt ausdrücklich als permanente Must-haves
  genannt?
- [ ] Ist für Motion ausdrücklich „in jedem Frame stabil“ verlangt?
- [ ] Sind Format/Auflösung und verbotene Elemente korrekt angegeben?
- [ ] Ist die Ausgabe ein vollständiges Release-Asset und kein textloser
  Hintergrund/Zwischenschritt?

Erst wenn alle sieben Punkte mit `ja` beantwortet sind, darf die Generierung
gestartet werden.

## Gate 5 — QA nach der Generierung

- [ ] Logoform entspricht der offiziellen Referenz exakt.
- [ ] `3AHAR` ist exakt geschrieben.
- [ ] Songtitel ist exakt geschrieben und vollständig sichtbar.
- [ ] Logo und Titel sind bei Zielgröße und Thumbnailgröße lesbar.
- [ ] Bei Motion wurden Anfang, Mitte und Ende geprüft; Logo und Titel bleiben
  durchgehend stabil.
- [ ] Cover und YouTube-Thumbnail existieren beide und erfüllen ihre Formate.

Ein Fehler in Logo, Titel oder Permanenz ist ein **Reject**. Das Asset darf
nicht als final, Kandidat oder Startpunkt der nächsten Produktionsstufe gelten.

## Verbindliche Detailquelle

Zusätzlich gilt die vollständige Distributions- und Rechte-Checkliste:

`/Users/peter/claude_code/DistroKid/docs/RELEASE_CHECKLIST_AND_LESSONS_LEARNED.md`
