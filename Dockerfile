# Multi-stage / optimized production Dockerfile for Personal UPI Gateway Backend
FROM node:20-alpine

# Install build dependencies for sqlite3 native compilation on alpine
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Copy dependency manifests first for optimal Docker layer caching
COPY package*.json ./

# Install dependencies cleanly (suppress noisy transitive warnings)
RUN npm install --omit=dev --no-audit --no-fund --loglevel=error

# Copy all source files, configurations, and public static assets
COPY . .

# Create persistent storage folder for SQLite database
RUN mkdir -p /app/data

# Expose service port
EXPOSE 3000

# Set production environment defaults
ENV NODE_ENV=production
ENV PORT=3000

# Run health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

# Start the Gateway backend
CMD ["node", "server.js"]
