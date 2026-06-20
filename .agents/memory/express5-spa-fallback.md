---
name: Express 5 SPA fallback / path-to-regexp wildcard crash
description: Why a bare "*" catch-all route crashes the Express 5 API server only in production, and the safe SPA-fallback pattern to use instead.
---

# Express 5 catch-all route crashes the server at startup

Express 5 (this repo: `express@5.x`) uses `path-to-regexp@8`, which **throws at route-registration time** on a bare wildcard path like `app.get("*", ...)` — error: `Missing parameter name at index 1: *`. This happens while building the app, before `app.listen()`, so the process exits and the port never opens.

**Why it can hide:** the catch-all SPA fallback lived inside an `if (process.env.NODE_ENV === "production")` block in `artifacts/api-server/src/app.ts`. Dev runs with `NODE_ENV=development`, so the block never executed and dev booted fine — while the **deployment crash-looped** (deploy logs: `path-to-regexp` error + `/api` healthcheck returning 500 + "required port was never opened").

**Safe fix:** use a path-less SPA-fallback **middleware** (no path string → no path-to-regexp parsing), gated to GET/HEAD, mounted after `express.static` and after `app.use("/api", router)`:

```
app.use((req, res, next) => {
  if (req.method !== "GET" && req.method !== "HEAD") return next();
  res.sendFile(path.join(staticDir, "index.html"));
});
```

If you ever need a real wildcard *route* in Express 5, it must be a **named** splat, e.g. `/*splat`, never bare `"*"`.

**Why:** path-to-regexp@8 requires names for wildcards/params; bare `*` and bare `:` are rejected.

**How to apply:** any catch-all / 404 / SPA-fallback in an Express 5 app must avoid bare `"*"`. Prefer a path-less middleware. Also: production-only code paths won't be caught by the dev workflow — verify route registration under `NODE_ENV=production` (e.g. import `express` and register the route in a throwaway script) before publishing.
