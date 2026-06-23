# Proxmox + NAS Migration — Plan & Runbook (2026-06-23)

Goal: run AI Music Factory on Proxmox with **Postgres** as the DB and **media
storage on the NAS**. Decisions taken with Peter: DB = Postgres, deployment =
Docker Compose.

> Status: code/config **prepared** (Dockerfile, docker-compose.yml, requirements.txt,
> .dockerignore, prod npm scripts). NOT deploy-tested (no Proxmox/NAS access from
> the dev box). Follow this runbook on the target host.

---

## Docker vs. LXC — recommendation

**Docker Compose, running inside one Proxmox LXC (nesting enabled).**

- This app needs ffmpeg + python(librosa, whisper/torch) + node + Postgres. Pinning
  all of that in an image (Docker) is **far easier to maintain** than installing &
  upgrading it by hand in a bare LXC.
- Performance: the pipeline is ffmpeg/CPU-bound; container overhead is noise. Bare
  LXC is marginally lighter, but not enough to outweigh reproducibility.
- LXC (vs full VM) keeps it lightweight; Docker-in-LXC works on modern Proxmox with
  `features: nesting=1` (+ `keyctl=1`).

So: **Proxmox LXC (Debian 12, nesting) → Docker + Compose → web / worker /
telegram-poller / postgres.**

---

## Architecture

```
Proxmox LXC (Debian, nesting=1)
└─ docker compose
   ├─ db     postgres:16        (named volume pgdata, local fast disk)
   ├─ web    next start :3000   (DATABASE_URL→db, STORAGE_BASE_PATH=/data/storage)
   ├─ worker tsx worker         (same DB + storage; NEXT_PUBLIC_APP_URL=http://web:3000)
   └─ telegram-poller           (forwards getUpdates → http://web:3000 webhook)
NAS  ──(NFS/SMB mount on host)── /mnt/nas/amf-storage ──bind──> /data/storage
```

- **DB stays on local/fast disk** (Postgres on NFS is discouraged). The NAS holds
  only the large media files (`storage/`), via `STORAGE_BASE_PATH` which the app
  already honors (`lib/storage`).
- Postgres → NAS only for **backups** (`pg_dump` cron), not the live data dir.

---

## 1. Proxmox LXC

- Create a Debian 12 LXC, 4+ cores, 8+ GB RAM, 20+ GB root (whisper/torch image is large).
- Enable nesting for Docker: in `/etc/pve/lxc/<id>.conf`
  ```
  features: nesting=1,keyctl=1
  ```
- Inside: `apt update && apt install -y docker.io docker-compose-plugin`.

## 2. NAS mount (host)

- Mount the NAS share on the LXC host (or pass through), e.g. NFS in `/etc/fstab`:
  ```
  <nas-ip>:/volume1/amf-storage  /mnt/nas/amf-storage  nfs  defaults,_netdev  0 0
  ```
- `mkdir -p /mnt/nas/amf-storage` and verify read/write as the container user.

## 3. App + env

```bash
git clone <repo> /opt/amf && cd /opt/amf
cp .env.example .env   # fill in all keys
```
Set in `.env`:
```
POSTGRES_PASSWORD=<strong>
STORAGE_DIR=/mnt/nas/amf-storage          # NAS bind source (compose)
NEXT_PUBLIC_APP_URL=https://<public-host>  # web service (OAuth redirect)
# plus all existing keys: GEMINI/OPENROUTER/PEXELS/PIXABAY/SUNOAPI/TELEGRAM/YOUTUBE…
# DATABASE_URL + STORAGE_BASE_PATH are set per-service in docker-compose.yml
```

## 4. Switch Prisma to Postgres

`prisma/schema.prisma`:
```prisma
datasource db {
  provider = "postgresql"   // was: sqlite
  url      = env("DATABASE_URL")
}
```
Because the local SQLite migration history is messy (failed
`20260617175439_add_job_next_retry_at`), create a **fresh Postgres baseline**:
```bash
rm -rf prisma/migrations            # only for the PG baseline; keep a copy if unsure
npx prisma migrate dev --name init  # against the running Postgres
```

## 5. Data migration (SQLite → Postgres)  — only if keeping existing rows

Use **pgloader** (handles SQLite→PG types in one shot):
```bash
apt install -y pgloader
pgloader prisma/dev.db postgresql://amf:<pw>@localhost:5432/amf
```
Then copy existing media into the NAS storage dir, preserving the
`storage/projects/...` layout. (Or start clean and regenerate.)

## 6. Bring it up

```bash
docker compose build
docker compose up -d
docker compose logs -f worker   # confirm "Starting AI Music Factory worker..."
```

## 7. Post-deploy

- **YouTube re-connect** (Settings → connect YouTube) so the token gets the
  `youtube.force-ssl` scope → captions upload works. OAuth redirect must match
  `NEXT_PUBLIC_APP_URL` + `/api/auth/youtube/callback` (registered in Google console).
- **Telegram poller** runs as its own service; no public webhook needed.
- **Postgres backups**: cron `pg_dump` to the NAS.

---

## Validation checklist

- [ ] `docker compose ps` — db healthy, web/worker/poller up.
- [ ] Dashboard loads, project pages load.
- [ ] Create a song → worker logs polling → tracks analyzed (librosa works in-container).
- [ ] Render a video → ffmpeg works → playable in UI.
- [ ] Approve → YouTube upload (public), title `Song (Version) - PtrX`.
- [ ] Captions appear after re-auth (else logged-skipped).
- [ ] Media files land under the NAS mount, not inside the container.

## Gotchas

- Image is large (torch/whisper ~2–3 GB). If captions aren't needed, drop
  `openai-whisper` from `requirements.txt` to shrink it (librosa stays — it's core).
- Don't put the **Postgres data dir** on NFS. NAS = media + backups only.
- `next start` needs `npm run build` first (done in the image).
- Keep `STORAGE_BASE_PATH` consistent between web and worker (both `/data/storage`).
