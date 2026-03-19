# =============================================================================
# Stage 1: Install production deps with npm (handles sharp's native bindings)
# =============================================================================
FROM node:20-slim AS deps

WORKDIR /app
COPY package.json package-lock.json* ./
COPY scripts/ensure-sharp-libvips-link.mjs scripts/

# npm reliably resolves platform-specific optional deps (sharp linux-x64)
# --ignore-scripts avoids running "prepare" (husky) which is a devDependency
RUN npm install --production --legacy-peer-deps --ignore-scripts

# =============================================================================
# Stage 2: Build frontend with full deps
# =============================================================================
FROM node:20-slim AS builder

WORKDIR /app
ENV NODE_OPTIONS="--max-old-space-size=4096"

COPY package.json package-lock.json* ./
COPY scripts/ensure-sharp-libvips-link.mjs scripts/
RUN npm install --legacy-peer-deps

COPY . .

# Vite only needs VITE_* vars at build time (no secrets needed)
ARG VITE_API_URL
ARG VITE_API_ORIGIN
ARG VITE_USE_VERCEL_AI_SDK

ENV VITE_API_URL=$VITE_API_URL
ENV VITE_API_ORIGIN=$VITE_API_ORIGIN
ENV VITE_USE_VERCEL_AI_SDK=$VITE_USE_VERCEL_AI_SDK

RUN npm run build && \
    echo "=== Build complete ===" && \
    ls -la dist/

# =============================================================================
# Stage 3: Runtime
# =============================================================================
FROM node:20-slim

WORKDIR /app

# Production node_modules from npm (has correct linux-x64 sharp binaries)
COPY --from=deps /app/node_modules ./node_modules

# Built frontend
COPY --from=builder /app/dist ./dist

# Server code
COPY package.json ./
COPY server ./server

COPY scripts/ensure-sharp-libvips-link.mjs ./scripts/

# All secrets come from Dokploy env vars at runtime — not baked into the image.
# No ARG/ENV for secrets here. Dokploy injects them via docker service env.
ENV NODE_ENV=production

EXPOSE 8080

CMD ["node", "--import", "tsx", "server/index.ts"]
