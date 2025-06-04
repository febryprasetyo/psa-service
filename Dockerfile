# syntax=docker/dockerfile:1

ARG NODE_VERSION=22.13.1

# --- Build Stage ---
FROM node:${NODE_VERSION}-slim AS builder
WORKDIR /app

# Install curl for health checks
RUN apt-get update && apt-get install -y curl

# Install dependencies
COPY --link package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci

# Copy source code
COPY --link . .

# Build TypeScript
RUN npm run build

# Install only production deps
RUN --mount=type=cache,target=/root/.npm \
    npm ci --production

# --- Production Stage ---
FROM node:${NODE_VERSION}-slim AS final
WORKDIR /app

# Install curl for health checks
RUN apt-get update && apt-get install -y curl

# Create non-root user
RUN addgroup --system appgroup && adduser --system --ingroup appgroup appuser

# Copy build & dependencies
COPY --from=builder /app/build ./build
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
COPY --from=builder /app/assets ./assets

# Ensure the logs directory exists and is writable
RUN mkdir -p ./assets/logs && \
    chown -R appuser:appgroup ./assets

ENV NODE_ENV=production
ENV NODE_OPTIONS="--max-old-space-size=4096"

USER appuser

EXPOSE 5001
CMD ["node", "build/main.js"]
