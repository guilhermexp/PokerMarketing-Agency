FROM oven/bun:1-alpine

WORKDIR /app

# Copy package files
COPY package.json bun.lockb* ./

# Install dependencies (including devDependencies for build)
# Bun is more flexible with peer dependencies than npm
RUN bun install

# Copy source code (cache bust: 2026-01-18-v2)
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

# Set as ENV so they're available during npm run build
ENV GEMINI_API_KEY=$GEMINI_API_KEY
ENV VITE_CLERK_PUBLISHABLE_KEY=$VITE_CLERK_PUBLISHABLE_KEY
ENV CLERK_SECRET_KEY=$CLERK_SECRET_KEY
ENV OPENROUTER_API_KEY=$OPENROUTER_API_KEY
ENV BLOB_READ_WRITE_TOKEN=$BLOB_READ_WRITE_TOKEN
ENV DATABASE_URL=$DATABASE_URL
ENV RUBE_TOKEN=$RUBE_TOKEN
ENV FAL_KEY=$FAL_KEY

# Create .env file for Vite loadEnv AND build with env vars
RUN echo "GEMINI_API_KEY=$GEMINI_API_KEY" > .env && \
    echo "VITE_CLERK_PUBLISHABLE_KEY=$VITE_CLERK_PUBLISHABLE_KEY" >> .env && \
    echo "CLERK_SECRET_KEY=$CLERK_SECRET_KEY" >> .env && \
    echo "OPENROUTER_API_KEY=$OPENROUTER_API_KEY" >> .env && \
    echo "BLOB_READ_WRITE_TOKEN=$BLOB_READ_WRITE_TOKEN" >> .env && \
    echo "DATABASE_URL=$DATABASE_URL" >> .env && \
    echo "RUBE_TOKEN=$RUBE_TOKEN" >> .env && \
    echo "FAL_KEY=$FAL_KEY" >> .env && \
    echo "=== .env file ===" && cat .env && \
    echo "=== Building ===" && \
    bun run build && \
    echo "=== Build complete ===" && \
    ls -la dist/assets/

# Remove devDependencies to reduce image size
RUN bun pm cache rm && rm -rf node_modules && bun install --production

# Expose port
EXPOSE 8080

# Set environment variable
ENV NODE_ENV=production

# Start the server
CMD ["node", "server/index.mjs"]
