#!/bin/bash
# ============================================================
# Proxmox LXC CT Setup: Docker + gcui-art/suno-api
# Run this on the Proxmox HOST (not inside a VM/CT):
#   bash proxmox-setup-suno-ct.sh
# ============================================================
set -euo pipefail

# ── Auto-detect environment ──────────────────────────────────
VMID=$(pvesh get /cluster/nextid)
BRIDGE=$(ip route show default 2>/dev/null | awk '{print $5; exit}')
BRIDGE=${BRIDGE:-vmbr0}

# Find first storage that supports container rootfs
CT_STORAGE=$(pvesm status --content rootdir 2>/dev/null | awk 'NR>1 {print $1; exit}')
if [[ -z "$CT_STORAGE" ]]; then
  echo "ERROR: No storage found that supports rootdir. Check: pvesm status"
  exit 1
fi

# Template storage (where .tar.zst files live) — usually 'local'
TMPL_STORAGE="local"

# ── User-tunable settings ────────────────────────────────────
HOSTNAME="suno-api"
MEMORY=2048          # MB
CORES=2
DISK=20              # GB
IP="dhcp"            # or e.g. "192.168.1.50/24"
GW=""                # only needed for static IP, e.g. "192.168.1.1"
ROOT_PW=$(openssl rand -base64 12)

# Suno session cookie — fill in after setup, or set here
SUNO_COOKIE="${SUNO_COOKIE:-}"

# ── Print plan ───────────────────────────────────────────────
echo ""
echo "┌─────────────────────────────────────────────────┐"
echo "│  Proxmox CT: suno-api                           │"
echo "├─────────────────────────────────────────────────┤"
printf "│  VMID       : %-33s│\n" "$VMID"
printf "│  Hostname   : %-33s│\n" "$HOSTNAME"
printf "│  Storage    : %-33s│\n" "$CT_STORAGE"
printf "│  Bridge     : %-33s│\n" "$BRIDGE"
printf "│  Memory     : %-33s│\n" "${MEMORY} MB"
printf "│  Disk       : %-33s│\n" "${DISK} GB"
printf "│  IP         : %-33s│\n" "$IP"
echo "└─────────────────────────────────────────────────┘"
echo ""
read -rp "Proceed? [y/N] " confirm
[[ "$confirm" =~ ^[Yy]$ ]] || { echo "Aborted."; exit 0; }

# ── Download Debian 12 template if needed ───────────────────
TMPL_NAME="debian-12-standard_12.7-1_amd64.tar.zst"
TMPL_PATH="/var/lib/pve/local-content/template/cache/${TMPL_NAME}"

if ! pveam list "$TMPL_STORAGE" 2>/dev/null | grep -q "debian-12-standard"; then
  echo "▶  Downloading Debian 12 template..."
  pveam update
  pveam download "$TMPL_STORAGE" "$TMPL_NAME"
fi

TEMPLATE="${TMPL_STORAGE}:vztmpl/${TMPL_NAME}"

# ── Create CT ────────────────────────────────────────────────
echo "▶  Creating CT ${VMID} (${HOSTNAME})..."

NET_CONFIG="name=eth0,bridge=${BRIDGE},ip=${IP}"
[[ -n "$GW" ]] && NET_CONFIG+=",gw=${GW}"

pct create "$VMID" "$TEMPLATE" \
  --hostname "$HOSTNAME" \
  --memory "$MEMORY" \
  --cores "$CORES" \
  --rootfs "${CT_STORAGE}:${DISK}" \
  --net0 "$NET_CONFIG" \
  --password "$ROOT_PW" \
  --unprivileged 0 \
  --features "nesting=1,keyctl=1" \
  --onboot 1 \
  --start 1

echo "▶  Waiting for CT to boot..."
sleep 5

# ── Install Docker inside CT ─────────────────────────────────
echo "▶  Installing Docker..."
pct exec "$VMID" -- bash -c "
  set -e
  apt-get update -qq
  apt-get install -y --no-install-recommends ca-certificates curl gnupg
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/debian/gpg \
    | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg
  echo 'deb [arch=amd64 signed-by=/etc/apt/keyrings/docker.gpg] \
    https://download.docker.com/linux/debian bookworm stable' \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -qq
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
  systemctl enable docker
  systemctl start docker
  docker --version
"

# ── Deploy suno-api ──────────────────────────────────────────
echo "▶  Deploying gcui-art/suno-api..."

pct exec "$VMID" -- bash -c "
  mkdir -p /opt/suno-api
  cat > /opt/suno-api/docker-compose.yml << 'COMPOSE'
version: '3.8'
services:
  suno-api:
    image: gcui/suno-api:latest
    container_name: suno-api
    restart: unless-stopped
    ports:
      - '3001:3000'
    environment:
      - SUNO_COOKIE=${SUNO_COOKIE}
    healthcheck:
      test: [\"CMD\", \"curl\", \"-f\", \"http://localhost:3000/api/get_limit\"]
      interval: 30s
      timeout: 10s
      retries: 3
COMPOSE
  cd /opt/suno-api && docker compose pull && docker compose up -d
"

# ── Get CT IP ────────────────────────────────────────────────
sleep 3
CT_IP=$(pct exec "$VMID" -- ip -4 addr show eth0 \
  | awk '/inet / {print $2}' | cut -d/ -f1)

# ── Done ─────────────────────────────────────────────────────
echo ""
echo "┌─────────────────────────────────────────────────────────┐"
echo "│  ✓  CT ${VMID} ready                                    │"
echo "├─────────────────────────────────────────────────────────┤"
printf "│  CT IP       : %-42s│\n" "${CT_IP:-dhcp, check GUI}"
printf "│  suno-api    : %-42s│\n" "http://${CT_IP:-<ct-ip>}:3001"
printf "│  root pass   : %-42s│\n" "$ROOT_PW"
echo "├─────────────────────────────────────────────────────────┤"
echo "│  Next steps:                                            │"
echo "│  1. Get Suno cookie (suno.com DevTools → Cookies)       │"
echo "│  2. pct exec ${VMID} -- bash                              │"
echo "│     cd /opt/suno-api                                    │"
echo "│     SUNO_COOKIE='<cookie>' docker compose up -d         │"
echo "│  3. Set in AI Music Factory .env.local:                 │"
echo "│     MUSIC_PROVIDER=suno-gcui                            │"
printf "│     SUNO_PROVIDER_BASE_URL=http://%-24s│\n" "${CT_IP:-<ct-ip>}:3001"
echo "└─────────────────────────────────────────────────────────┘"
