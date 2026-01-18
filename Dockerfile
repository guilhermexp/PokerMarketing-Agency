# Build stage - use Node for Vite build
FROM node:20-alpine AS builder

WORKDIR /app

# Increase memory limits for build
ENV NODE_OPTIONS="--max-old-space-size=4096"

# Copy package files
COPY package.json package-lock.json* ./

# Install dependencies with npm (more stable for build)
# Use --legacy-peer-deps to resolve the ai@6.x vs @openrouter/ai-sdk-provider peer dependency conflict
RUN npm install --legacy-peer-deps

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
RUN npm run build && \
    echo "=== Build complete ===" && \
    ls -la dist/

# Runtime stage - use Bun for the server
FROM oven/bun:1-alpine

WORKDIR /app

# Copy package files
COPY package.json bun.lockb* ./

# Install production dependencies only with Bun
RUN bun install --production

# Copy built files from builder
COPY --from=builder /app/dist ./dist

# Copy server code
COPY server ./server

# Copy public assets if they exist
COPY --from=builder /app/public ./public 2>/dev/null || true

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

# Start the server with Bun (faster and fully Node.js compatible)
CMD ["bun", "run", "server/index.mjs"]
