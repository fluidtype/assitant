# tomchat-v2

SaaS multi-tenant (WhatsApp reservations assistant). Blocks 0–4 ready (scaffold, config/env, DB with Prisma, Redis caches).

## Requirements

- Node.js 18+
- npm
- PostgreSQL 16 (local o Docker)
- Redis 7 (local o Docker)

## Quick Start (dev)

```bash
# 1) entra nella root
cd ~/Desktop/tomchat-v2

# 2) env
cp .env.example .env

# 3) servizi (scegli una via)
# Docker:
# docker run -d --name pg-tom -e POSTGRES_USER=tom -e POSTGRES_PASSWORD=tom -e POSTGRES_DB=tomchat_v2 -p 5432:5432 postgres:16
# docker run -d --name redis-tom -p 6379:6379 redis:7 redis-server --appendonly yes
# oppure Homebrew:
# brew install postgresql@16 redis
# brew services start postgresql@16
# brew services start redis

# 4) install + prisma
npm ci
npm run db:generate
npm run db:migrate
npm run db:seed

# 5) avvia
npm run dev
```

## Smoke Test

```bash
curl -s http://localhost:3000/health
curl -s http://localhost:3000/v1/health
curl -s -H "x-tenant-id: demo" http://localhost:3000/v1/webhook
curl -s -X POST -H "Content-Type: application/json" -H "x-tenant-id: demo" -d '{"text":"ping"}' http://localhost:3000/v1/webhook
```

## Useful Scripts

```bash
npm run check:all   # lint + typecheck + build + format:check
npm run db:reset    # drop & migrate & seed (dev only)
npm run db:studio   # Prisma Studio
npm run redis:ping  # quick ping
npm run redis:smoke # set/get with TTL example
```

## Build & Start (prod-like)

```bash
npm run build
npm start
# server runs compiled JS with Node
```
