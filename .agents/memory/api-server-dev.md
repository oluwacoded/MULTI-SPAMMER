---
name: API server dev workflow
description: How the api-server runs in dev and how to test its endpoints in this monorepo
---

# API server dev workflow

The `@workspace/api-server` dev script does `pnpm run build && pnpm run start` — it bundles to `dist/` then runs from `dist/index.mjs`. It does NOT hot-reload from `src/`.

**How to apply:** After editing api-server source, restart the `artifacts/api-server: API Server` workflow so the rebuild picks up your changes. A running server started before your edit will 404 new routes until restarted.

# Testing endpoints

Both artifacts sit behind a shared path proxy: frontend at `/`, api-server at `/api` (local port 8080). Relative `fetch("/api/...")` from the frontend works same-origin. To test from the shell, hit `http://localhost:8080/api/...` directly, or `$REPLIT_DEV_DOMAIN/api/...` through the proxy. Health check: `/api/healthz`.
