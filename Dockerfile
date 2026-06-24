# AI Music Factory — single image, run as web / worker / telegram-poller.
# Debian (not alpine): librosa + openai-whisper (torch) need glibc, and ffmpeg
# is a first-class dependency of the render pipeline.
FROM node:20-bookworm-slim AS base
ENV NODE_ENV=production
WORKDIR /app

# System deps: ffmpeg (render), python3 + venv (librosa beat analysis, whisper
# captions). git is occasionally needed by npx tooling.
RUN apt-get update && apt-get install -y --no-install-recommends \
      ffmpeg python3 python3-venv python3-pip python3-setuptools git ca-certificates \
      build-essential gcc g++ libsndfile1 \
      libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 \
      libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 \
      libgbm1 libasound2 libpango-1.0-0 libcairo2 libx11-6 libxext6 \
    && rm -rf /var/lib/apt/lists/*

# Python audio deps in an isolated venv. openai-whisper pulls torch (large) —
# only needed for captions/transcription; keep it here so the pipeline is whole.
ENV VIRTUAL_ENV=/opt/venv
RUN python3 -m venv --system-site-packages $VIRTUAL_ENV
ENV PATH="$VIRTUAL_ENV/bin:$PATH"
RUN pip install --no-cache-dir --upgrade pip setuptools wheel
COPY requirements.txt ./
# openai-whisper (captions only) excluded: builds torch from source, not needed for core pipeline
RUN pip install --no-cache-dir librosa==0.10.2.post1 numpy==1.26.4 soundfile==0.12.1

# Node deps — install all (dev included) for build; devDeps needed by Next.js build + tsx worker.
COPY package.json package-lock.json* ./
RUN npm ci --include=dev

# App source + build
COPY . .
# Switch Prisma from SQLite (local dev) to Postgres (production)
RUN sed -i 's/provider = "sqlite"/provider = "postgresql"/' prisma/schema.prisma
# DATABASE_URL dummy prevents Prisma from failing during Next.js static prerender
RUN DATABASE_URL=postgresql://x:x@localhost:5432/x npx prisma generate && \
    DATABASE_URL=postgresql://x:x@localhost:5432/x npm run build

EXPOSE 3000
# Default = web. Compose overrides `command:` for worker / telegram-poller.
CMD ["npm", "run", "start"]
