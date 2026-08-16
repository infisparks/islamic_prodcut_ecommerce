# Multi-stage production-ready Dockerfile for Fatima Calligrapher Ecommerce
FROM node:20-alpine AS base

# Install security updates
RUN apk update && apk upgrade && apk add --no-cache dumb-init

# Set working directory
WORKDIR /usr/src/app

# Copy package definition files
COPY package*.json ./

# Install dependencies (production only)
RUN npm ci --only=production && npm cache clean --force

# Copy application source code and assets
COPY *.html database.rules.json ./
COPY product ./product
COPY video ./video
COPY hero* ./
COPY backend ./backend

# Use non-root node user for container security
USER node

# Expose port
EXPOSE 3000

# Environment defaults
ENV NODE_ENV=production
ENV PORT=3000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

# Start application with dumb-init for proper signal handling
CMD ["dumb-init", "node", "backend/server.js"]
