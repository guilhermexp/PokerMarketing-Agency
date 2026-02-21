# =============================================================================
# Stage 1: Install production deps with npm (handles sharp's native bindings)
# =============================================================================
FROM node:20-slim AS deps

WORKDIR /app
COPY package.json package-lock.json* ./
COPY scripts/ensure-sharp-libvips-link.mjs scripts/

# npm reliably resolves platform-specific optional deps (sharp linux-x64)
RUN npm install --production --legacy-peer-deps

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

# Build args from Railway
ARG GEMINI_API_KEY
ARG BETTER_AUTH_SECRET
ARG BETTER_AUTH_BASE_URL
ARG OPENROUTER_API_KEY
ARG BLOB_READ_WRITE_TOKEN
ARG DATABASE_URL
ARG RUBE_TOKEN
ARG FAL_KEY

ENV GEMINI_API_KEY=$GEMINI_API_KEY
ENV BETTER_AUTH_SECRET=$BETTER_AUTH_SECRET
ENV BETTER_AUTH_BASE_URL=$BETTER_AUTH_BASE_URL
ENV OPENROUTER_API_KEY=$OPENROUTER_API_KEY
ENV BLOB_READ_WRITE_TOKEN=$BLOB_READ_WRITE_TOKEN
ENV DATABASE_URL=$DATABASE_URL
ENV RUBE_TOKEN=$RUBE_TOKEN
ENV FAL_KEY=$FAL_KEY

RUN echo "GEMINI_API_KEY=$GEMINI_API_KEY" > .env && \
    echo "BETTER_AUTH_SECRET=$BETTER_AUTH_SECRET" >> .env && \
    echo "BETTER_AUTH_BASE_URL=$BETTER_AUTH_BASE_URL" >> .env && \
    echo "OPENROUTER_API_KEY=$OPENROUTER_API_KEY" >> .env && \
    echo "BLOB_READ_WRITE_TOKEN=$BLOB_READ_WRITE_TOKEN" >> .env && \
    echo "DATABASE_URL=$DATABASE_URL" >> .env && \
    echo "RUBE_TOKEN=$RUBE_TOKEN" >> .env && \
    echo "FAL_KEY=$FAL_KEY" >> .env

RUN npm run build && \
    echo "=== Build complete ===" && \
    ls -la dist/

# =============================================================================
# Stage 3: Runtime — Bun for speed, npm-installed deps for compatibility
# =============================================================================
FROM oven/bun:1-debian

WORKDIR /app

# Production node_modules from npm (has correct linux-x64 sharp binaries)
COPY --from=deps /app/node_modules ./node_modules

# Built frontend
COPY --from=builder /app/dist ./dist

# Server code
COPY package.json ./
COPY server ./server

# Runtime env from Railway
ARG GEMINI_API_KEY
ARG BETTER_AUTH_SECRET
ARG BETTER_AUTH_BASE_URL
ARG OPENROUTER_API_KEY
ARG BLOB_READ_WRITE_TOKEN
ARG DATABASE_URL
ARG RUBE_TOKEN
ARG FAL_KEY

ENV GEMINI_API_KEY=$GEMINI_API_KEY
ENV BETTER_AUTH_SECRET=$BETTER_AUTH_SECRET
ENV BETTER_AUTH_BASE_URL=$BETTER_AUTH_BASE_URL
ENV OPENROUTER_API_KEY=$OPENROUTER_API_KEY
ENV BLOB_READ_WRITE_TOKEN=$BLOB_READ_WRITE_TOKEN
ENV DATABASE_URL=$DATABASE_URL
ENV RUBE_TOKEN=$RUBE_TOKEN
ENV FAL_KEY=$FAL_KEY
ENV NODE_ENV=production

EXPOSE 8080

CMD ["bun", "run", "server/index.mjs"]
