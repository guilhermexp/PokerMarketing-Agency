FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies (including devDependencies for build)
RUN npm install

# Copy source code
COPY . .

# Get build args from Railway
ARG GEMINI_API_KEY
ARG VITE_CLERK_PUBLISHABLE_KEY
ARG OPENROUTER_API_KEY
ARG BLOB_READ_WRITE_TOKEN
ARG DATABASE_URL
ARG RUBE_TOKEN

# Set as ENV so they're available during npm run build
ENV GEMINI_API_KEY=$GEMINI_API_KEY
ENV VITE_CLERK_PUBLISHABLE_KEY=$VITE_CLERK_PUBLISHABLE_KEY
ENV OPENROUTER_API_KEY=$OPENROUTER_API_KEY
ENV BLOB_READ_WRITE_TOKEN=$BLOB_READ_WRITE_TOKEN
ENV DATABASE_URL=$DATABASE_URL
ENV RUBE_TOKEN=$RUBE_TOKEN

# Create .env file for Vite loadEnv AND build with env vars
RUN echo "GEMINI_API_KEY=$GEMINI_API_KEY" > .env && \
    echo "VITE_CLERK_PUBLISHABLE_KEY=$VITE_CLERK_PUBLISHABLE_KEY" >> .env && \
    echo "OPENROUTER_API_KEY=$OPENROUTER_API_KEY" >> .env && \
    echo "BLOB_READ_WRITE_TOKEN=$BLOB_READ_WRITE_TOKEN" >> .env && \
    echo "DATABASE_URL=$DATABASE_URL" >> .env && \
    echo "RUBE_TOKEN=$RUBE_TOKEN" >> .env && \
    echo "=== .env file ===" && cat .env && \
    echo "=== Building ===" && \
    npm run build && \
    echo "=== Build complete ===" && \
    ls -la dist/assets/

# Remove devDependencies to reduce image size
RUN npm prune --production

# Expose port
EXPOSE 8080

# Set environment variable
ENV NODE_ENV=production

# Start the server
CMD ["node", "server/index.mjs"]
