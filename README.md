# tomchat-v2

SaaS multi-tenant (WhatsApp reservations assistant). Blocks 0–2 ready.

## Requirements

- Node.js 18+
- npm

## Running (dev)

```bash
npm install
npm run dev
# open http://localhost:3000/health -> {"status":"ok"}
```

## Build & Start (prod)

```bash
npm run build
npm start
# server runs compiled JS with Node
```

## Quality

```bash
npm run lint
npm run format
npm run format:check
npm run typecheck
```
