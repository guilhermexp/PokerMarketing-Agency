# Build stage - Bun for deps, Node for Vite build
FROM oven/bun:1-debian AS builder

WORKDIR /app

# Node.js is needed for Vite build
RUN apt-get update && apt-get install -y --no-install-recommends nodejs && rm -rf /var/lib/apt/lists/*

# Increase memory limits for build
ENV NODE_OPTIONS="--max-old-space-size=4096"

# Copy only package.json (NOT bun.lockb — it locks macOS-only native deps)
COPY package.json ./
COPY scripts/ensure-sharp-libvips-link.mjs scripts/

# Fresh install resolves correct platform-specific binaries (linux-x64)
RUN bun install

# Copy source code
COPY . .

# Get build args from Railway
ARG GEMINI_API_KEY
ARG VITE_CLERK_PUBLISHABLE_KEY
ARG CLERK_SECRET_KEY
ARG OPENROUTER_API_KEY
ARG BLOB_READ_WRITE_TOKEN
ARG DATABASE_URL
ARG RUBE_TOKEN
ARG FAL_KEY

# Set as ENV so they're available during build
ENV GEMINI_API_KEY=$GEMINI_API_KEY
ENV VITE_CLERK_PUBLISHABLE_KEY=$VITE_CLERK_PUBLISHABLE_KEY
ENV CLERK_SECRET_KEY=$CLERK_SECRET_KEY
ENV OPENROUTER_API_KEY=$OPENROUTER_API_KEY
ENV BLOB_READ_WRITE_TOKEN=$BLOB_READ_WRITE_TOKEN
ENV DATABASE_URL=$DATABASE_URL
ENV RUBE_TOKEN=$RUBE_TOKEN
ENV FAL_KEY=$FAL_KEY

# Create .env file for Vite loadEnv
RUN echo "GEMINI_API_KEY=$GEMINI_API_KEY" > .env && \
    echo "VITE_CLERK_PUBLISHABLE_KEY=$VITE_CLERK_PUBLISHABLE_KEY" >> .env && \
    echo "CLERK_SECRET_KEY=$CLERK_SECRET_KEY" >> .env && \
    echo "OPENROUTER_API_KEY=$OPENROUTER_API_KEY" >> .env && \
    echo "BLOB_READ_WRITE_TOKEN=$BLOB_READ_WRITE_TOKEN" >> .env && \
    echo "DATABASE_URL=$DATABASE_URL" >> .env && \
    echo "RUBE_TOKEN=$RUBE_TOKEN" >> .env && \
    echo "FAL_KEY=$FAL_KEY" >> .env

# Build the app
RUN bun run build && \
    echo "=== Build complete ===" && \
    ls -la dist/

# Prune dev dependencies after build, keeping only production deps
RUN rm -rf node_modules && bun install --production

# Runtime stage
FROM oven/bun:1-debian

WORKDIR /app

# Copy production node_modules from builder (already has correct linux-x64 binaries)
COPY --from=builder /app/node_modules ./node_modules

# Copy built files from builder
COPY --from=builder /app/dist ./dist

# Copy server code and package.json
COPY package.json ./
COPY server ./server

# Get runtime args from Railway
ARG GEMINI_API_KEY
ARG VITE_CLERK_PUBLISHABLE_KEY
ARG CLERK_SECRET_KEY
ARG OPENROUTER_API_KEY
ARG BLOB_READ_WRITE_TOKEN
ARG DATABASE_URL
ARG RUBE_TOKEN
ARG FAL_KEY

# Set runtime ENV
ENV GEMINI_API_KEY=$GEMINI_API_KEY
ENV VITE_CLERK_PUBLISHABLE_KEY=$VITE_CLERK_PUBLISHABLE_KEY
ENV CLERK_SECRET_KEY=$CLERK_SECRET_KEY
ENV OPENROUTER_API_KEY=$OPENROUTER_API_KEY
ENV BLOB_READ_WRITE_TOKEN=$BLOB_READ_WRITE_TOKEN
ENV DATABASE_URL=$DATABASE_URL
ENV RUBE_TOKEN=$RUBE_TOKEN
ENV FAL_KEY=$FAL_KEY
ENV NODE_ENV=production

# Expose port
EXPOSE 8080

# Start the server
CMD ["bun", "run", "server/index.mjs"]
