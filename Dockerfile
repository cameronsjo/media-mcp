# syntax=docker/dockerfile:1

# Build stage - use slim for better native module compatibility
FROM node:20-slim AS builder

# Install build dependencies for better-sqlite3
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files for dependency installation
COPY package*.json ./

# Install all dependencies (including devDependencies for build)
RUN npm ci

# Copy source code
COPY tsconfig.json ./
COPY src ./src

# Build TypeScript
RUN npm run build

# Prune dev dependencies, keeping only production deps with compiled native modules
RUN npm prune --omit=dev

# Production stage
FROM node:20-slim AS production

# Install wget for health checks
RUN apt-get update && apt-get install -y wget && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files
COPY package*.json ./

# Copy node_modules from builder (already pruned to production only, with native modules compiled)
COPY --from=builder /app/node_modules ./node_modules

# Copy built application
COPY --from=builder /app/dist ./dist

# Create non-root user for security
RUN groupadd -g 1001 nodejs && \
    useradd -u 1001 -g nodejs -m nodejs

# Create cache directory with proper permissions
RUN mkdir -p /app/cache && chown nodejs:nodejs /app/cache

# Switch to non-root user
USER nodejs

# Environment variables with defaults
ENV NODE_ENV=production \
    MCP_TRANSPORT=http \
    MCP_HTTP_PORT=3000 \
    MCP_HTTP_HOST=0.0.0.0 \
    MCP_HTTP_PATH=/mcp \
    MCP_CACHE_ENABLED=true \
    MCP_CACHE_PATH=/app/cache/cache.db \
    LOG_LEVEL=info

# Expose HTTP port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget -q --spider http://localhost:3000/health || exit 1

# Run the server
CMD ["node", "dist/index.js", "--transport", "http"]
