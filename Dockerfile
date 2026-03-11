# ---------- Stage 1: deps ----------
FROM node:22-slim AS deps

WORKDIR /app

# Stable npm network config
RUN npm config set fetch-retries 5 \
 && npm config set fetch-retry-factor 2 \
 && npm config set fetch-retry-mintimeout 20000 \
 && npm config set fetch-retry-maxtimeout 120000 \
 && npm config set registry https://registry.npmjs.org/ \
 && npm config set prefer-online true

COPY package.json package-lock.json ./

# better-sqlite3 requires build tools for native compilation
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

RUN npm ci --no-audit

# ---------- Stage 2: build ----------
FROM node:22-slim AS builder

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN npm run build \
 && npm prune --omit=dev

# ---------- Stage 3: production ----------
FROM node:22-slim AS production

WORKDIR /app

# Runtime build tools needed for better-sqlite3 native module
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN groupadd -g 1001 nodejs \
 && useradd -u 1001 -g nodejs -m -s /bin/bash nestjs

# Create data directory for SQLite DB and plans
RUN mkdir -p /opt/devcollab /plans /workspaces \
 && chown -R nestjs:nodejs /opt/devcollab /plans /workspaces

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY package.json package-lock.json ./

USER nestjs

EXPOSE 3100

CMD ["node", "dist/main.js"]
