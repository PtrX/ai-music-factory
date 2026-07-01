# Migration Agent Runbook — AI Music Factory → Proxmox CT 100
_Für autonome Ausführung. Kein menschlicher Input während der Migration nötig._
_Stand: 2026-06-23_

## Kontext

AI Music Factory (Next.js + Worker + Telegram-Poller) soll von lokal (SQLite) auf
Proxmox CT 100 mit Postgres und NAS-Storage migriert werden. Der Agent führt alle
Schritte durch und schaltet auf Produktion um.

## Zugangsdaten & Pfade

| Was | Wert |
|---|---|
| SSH zu Proxmox | `ssh proxmox-prod` (→ 192.168.1.15, Key in `~/.ssh/proxmox_parallel_migration`) |
| CT 100 direkt | `ssh root@192.168.1.31` ODER `ssh proxmox-prod "pct exec 100 -- bash -c '...'"` |
| CT 100 IP | 192.168.1.31 |
| Lokales Repo | `/Users/peter/claude_code/AI Music Factory` |
| NAS auf Proxmox | `/mnt/pve/Backup_Synology` (NFS von 192.168.1.10) |
| NAS AMF-Ordner | `/mnt/pve/Backup_Synology/amf-storage` (Ziel für Medien) |
| CT 100 App-Pfad | `/opt/amf` |
| CT 100 NAS-Mount | `/mnt/nas/amf-storage` |
| Docker Storage-Bind | `STORAGE_DIR=/mnt/nas/amf-storage` (→ `/data/storage` im Container) |

## Checkliste (in Reihenfolge)

### Phase 1 — Proxmox Host vorbereiten

- [ ] **1.1** NAS-Verzeichnis für AMF anlegen:
  ```bash
  ssh proxmox-prod "mkdir -p /mnt/pve/Backup_Synology/amf-storage"
  ```

- [ ] **1.2** CT 100 stoppen, Bind-Mount hinzufügen, starten:
  ```bash
  ssh proxmox-prod "pct stop 100"
  ssh proxmox-prod "pct set 100 --mp0 /mnt/pve/Backup_Synology/amf-storage,mp=/mnt/nas/amf-storage"
  ssh proxmox-prod "pct start 100"
  sleep 5
  ```

- [ ] **1.3** Prüfen dass Mount im CT sichtbar ist:
  ```bash
  ssh proxmox-prod "pct exec 100 -- ls /mnt/nas/amf-storage" || echo "FEHLER: Mount nicht vorhanden"
  ```

### Phase 2 — Code + Secrets nach CT 100 synchronisieren

- [ ] **2.1** App-Code rsync (ohne node_modules, .next, dev.db):
  ```bash
  rsync -av --delete \
    --exclude=node_modules \
    --exclude=.next \
    --exclude='prisma/dev.db' \
    --exclude='dev.db' \
    --exclude='.env.local' \
    "/Users/peter/claude_code/AI Music Factory/" \
    "root@192.168.1.31:/opt/amf/"
  ```

- [ ] **2.2** `.env.local` als `.env` rüberkopieren (enthält alle API-Keys):
  ```bash
  scp "/Users/peter/claude_code/AI Music Factory/.env.local" "root@192.168.1.31:/opt/amf/.env"
  ```

- [ ] **2.3** Proxmox-spezifische Werte in `.env` setzen (DATABASE_URL + STORAGE_DIR + PG-Passwort + App-URL):
  ```bash
  ssh root@192.168.1.31 bash << 'ENVSSH'
  cd /opt/amf
  # Entferne SQLite DATABASE_URL (wird von docker-compose überschrieben)
  sed -i '/^DATABASE_URL=/d' .env
  # Setze Proxmox-spezifische Werte
  cat >> .env << 'EOF'
  POSTGRES_PASSWORD=<POSTGRES_PASSWORD>
  STORAGE_DIR=/mnt/nas/amf-storage
  NEXT_PUBLIC_APP_URL=http://192.168.1.31:3000
  EOF
  echo "ENV updated"
  ENVSSH
  ```

- [ ] **2.4** YouTube-Token kopieren (damit bestehende Auth weiterhin gilt):
  ```bash
  # Prüfen ob Token existiert
  TOKENS="/Users/peter/claude_code/AI Music Factory/storage/youtube-tokens.json"
  if [ -f "$TOKENS" ]; then
    ssh root@192.168.1.31 "mkdir -p /opt/amf/storage"
    scp "$TOKENS" "root@192.168.1.31:/opt/amf/storage/youtube-tokens.json"
    echo "YouTube tokens kopiert"
  else
    echo "WARN: Keine youtube-tokens.json gefunden"
  fi
  ```

- [ ] **2.5** SQLite-DB für Migration kopieren:
  ```bash
  scp "/Users/peter/claude_code/AI Music Factory/prisma/dev.db" "root@192.168.1.31:/opt/amf/prisma/dev.db"
  ```

### Phase 3 — Docker Build

- [ ] **3.1** In CT 100: docker-compose-plugin sicherstellen:
  ```bash
  ssh root@192.168.1.31 "docker compose version || apt-get install -y docker-compose-plugin"
  ```

- [ ] **3.2** Docker Image bauen (dauert ~10-20 min, librosa + whisper sind groß):
  ```bash
  ssh root@192.168.1.31 "cd /opt/amf && docker compose build --no-cache 2>&1 | tail -20"
  ```
  **Bei Fehler**: Logs prüfen mit `ssh root@192.168.1.31 "cd /opt/amf && docker compose build 2>&1 | grep -E 'ERROR|error' | head -20"`

### Phase 4 — Postgres starten + DB migrieren

- [ ] **4.1** Postgres starten und warten bis healthy:
  ```bash
  ssh root@192.168.1.31 "cd /opt/amf && docker compose up -d db"
  sleep 15
  ssh root@192.168.1.31 "cd /opt/amf && docker compose exec db pg_isready -U amf"
  ```

- [ ] **4.2** Prisma-Schema auf Postgres deployen:
  ```bash
  ssh root@192.168.1.31 "cd /opt/amf && docker compose run --rm web sh -c 'DATABASE_URL=postgresql://amf:<POSTGRES_PASSWORD>@db:5432/amf npx prisma migrate deploy'"
  ```

- [ ] **4.3** SQLite → Postgres migrieren via pgloader:
  ```bash
  ssh root@192.168.1.31 bash << 'MIGSSH'
  # pgloader installieren falls nicht vorhanden
  which pgloader || apt-get install -y pgloader

  # pgloader Kommando-Datei schreiben
  cat > /tmp/amf-migration.load << 'EOF'
  LOAD DATABASE
    FROM sqlite:///opt/amf/prisma/dev.db
    INTO postgresql://amf:<POSTGRES_PASSWORD>@127.0.0.1:5432/amf
  WITH include drop, create tables, create indexes, reset sequences
  SET work_mem to '128MB', maintenance_work_mem to '512MB'
  EXCLUDING TABLE NAMES MATCHING '_prisma_migrations';
  EOF

  # Postgres Port aus dem Container mappen (temporär für Migration)
  docker run -d --name pg-migrate-proxy \
    --network amf_default \
    -p 5432:5432 \
    --rm \
    alpine/socat tcp-listen:5432,fork,reuseaddr tcp:db:5432 2>/dev/null || true

  sleep 3
  pgloader /tmp/amf-migration.load 2>&1 | tail -30
  docker stop pg-migrate-proxy 2>/dev/null || true
  echo "Migration done"
  MIGSSH
  ```

  **Fallback falls pgloader nicht klappt** (Prisma db push + manuelles Seed):
  ```bash
  ssh root@192.168.1.31 "cd /opt/amf && docker compose run --rm web sh -c 'DATABASE_URL=postgresql://amf:<POSTGRES_PASSWORD>@db:5432/amf npx prisma db push'"
  ```

- [ ] **4.4** Datenmenge prüfen:
  ```bash
  ssh root@192.168.1.31 "cd /opt/amf && docker compose exec db psql -U amf -c 'SELECT COUNT(*) FROM \"Track\"; SELECT COUNT(*) FROM \"Project\"; SELECT COUNT(*) FROM \"Variant\";'"
  ```
  Erwartet: ~38 Tracks, ~1-2 Projects, ~5 Variants

### Phase 5 — Alle Services starten

- [ ] **5.1** Alle Services hochfahren:
  ```bash
  ssh root@192.168.1.31 "cd /opt/amf && docker compose up -d"
  sleep 20
  ```

- [ ] **5.2** Status prüfen:
  ```bash
  ssh root@192.168.1.31 "cd /opt/amf && docker compose ps"
  ```
  Erwartet: db, web, worker, telegram-poller — alle `running`/`Up`

- [ ] **5.3** App erreichbar:
  ```bash
  curl -s "http://192.168.1.31:3000/api/projects" | python3 -m json.tool | head -20
  ```
  Erwartet: JSON mit `projects` Array (nicht leer)

- [ ] **5.4** Logs auf Fehler prüfen:
  ```bash
  ssh root@192.168.1.31 "cd /opt/amf && docker compose logs --tail=30 web worker"
  ```

### Phase 6 — Medien von lokal nach NAS synchronisieren

- [ ] **6.1** Storage-Ordner nach NAS rsync:
  ```bash
  rsync -av \
    "/Users/peter/claude_code/AI Music Factory/storage/" \
    "root@192.168.1.31:/mnt/nas/amf-storage/"
  ```
  (Das sind Audio-Dateien, Covers, etc. — kann ein paar Minuten dauern)

- [ ] **6.2** Prüfen dass Covers im Container sichtbar sind:
  ```bash
  ssh root@192.168.1.31 "cd /opt/amf && docker compose exec web ls /data/storage/ | head -10"
  ```

### Phase 7 — Finale Verifikation

- [ ] **7.1** API liefert Projekte mit Tracks:
  ```bash
  curl -s "http://192.168.1.31:3000/api/projects" | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'{len(d[\"projects\"])} Projekte, {sum(len(v[\"tracks\"]) for p in d[\"projects\"] for v in p[\"variants\"])} Tracks')"
  ```

- [ ] **7.2** Docker compose logs sauber (keine FATAL/ERROR):
  ```bash
  ssh root@192.168.1.31 "cd /opt/amf && docker compose logs --tail=50 2>&1 | grep -iE 'fatal|error|exception' | grep -v 'router\|404\|not found'"
  ```

- [ ] **7.3** Worker läuft (verarbeitet Jobs):
  ```bash
  ssh root@192.168.1.31 "cd /opt/amf && docker compose logs worker --tail=10"
  ```

## Ergebnis

Nach erfolgreichem Abschluss:
- App läuft auf `http://192.168.1.31:3000`
- Alle Daten aus SQLite sind in Postgres
- Medien auf NAS unter `/mnt/pve/Backup_Synology/amf-storage`
- Alle 4 Services (db, web, worker, telegram-poller) laufen

## Bekannte Fallstricke

- **pgloader + Docker-Netzwerk**: pgloader läuft auf CT-100-Host, Postgres ist im Docker-Netz. Socat-Proxy bridged das.
- **Build-Zeit**: librosa + whisper ziehen ~2GB Python-Pakete. 20+ Min normal.
- **_prisma_migrations Tabelle**: pgloader excluded sie (`EXCLUDING TABLE NAMES MATCHING '_prisma_migrations'`), Prisma schreibt die eigene History nach `migrate deploy`.
- **STORAGE_DIR**: Muss im CT 100 als echter Pfad existieren (`/mnt/nas/amf-storage` via Bind-Mount von LXC-Config). Docker kann es sonst nicht mounten.
- **Postgres PW**: nur in `.env` auf CT 100 (nicht in diesem Dokument), nie committen oder öffentlich teilen.
