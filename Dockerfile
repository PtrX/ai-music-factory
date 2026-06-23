# AI Music Factory — single image, run as web / worker / telegram-poller.
# Debian (not alpine): librosa + openai-whisper (torch) need glibc, and ffmpeg
# is a first-class dependency of the render pipeline.
FROM node:20-bookworm-slim AS base
ENV NODE_ENV=production
WORKDIR /app

# System deps: ffmpeg (render), python3 + venv (librosa beat analysis, whisper
# captions). git is occasionally needed by npx tooling.
RUN apt-get update && apt-get install -y --no-install-recommends \
      ffmpeg python3 python3-venv python3-pip git ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Python audio deps in an isolated venv. openai-whisper pulls torch (large) —
# only needed for captions/transcription; keep it here so the pipeline is whole.
ENV VIRTUAL_ENV=/opt/venv
RUN python3 -m venv $VIRTUAL_ENV
ENV PATH="$VIRTUAL_ENV/bin:$PATH"
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Node deps (include dev deps: tsx runs the worker/poller, prisma generates).
COPY package.json package-lock.json* ./
RUN npm ci

# App source + build
COPY . .
RUN npx prisma generate && npm run build

EXPOSE 3000
# Default = web. Compose overrides `command:` for worker / telegram-poller.
CMD ["npm", "run", "start"]
