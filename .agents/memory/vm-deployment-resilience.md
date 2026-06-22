---
name: VM deployment resilience (Telegram bot)
description: Why the Reserved VM had recurring outages and the durable guardrails/decisions that fix it.
---

## Recurring VM outages trace to unguarded background async
The api-server runs as ONE Node process on a "vm" deployment AND hosts the stateful
Telegram engine, which does heavy fire-and-forget async (boot reconnect-all, scrape/add
jobs, timer-driven add/campaign loops, message handlers). A single unhandled rejection /
uncaught exception there kills the whole process → outage → auto-restart → reconnect
storm → it can crash again → recurring ~15-min outages.

**Decision:** register process-level `unhandledRejection` + `uncaughtException` handlers
that LOG and KEEP THE PROCESS ALIVE, and make boot non-fatal (guard the DB-restore +
engine init, add a top-level startup catch).
**Why:** for a long-running stateful bot, exiting *is* the outage; staying up through a
transient Telegram/DB fault is the lesser evil.
**How to apply / edge cases:** "log and continue" leaves the process in undefined state
after truly fatal errors — acceptable as an operational stopgap, not a permanent policy.
If hardening further: add a circuit-breaker (exit for a clean restart after N fatal
exceptions in M minutes), alert on rejection/exception counts, and add targeted
`.catch()` on the known fire-and-forget IIFEs/timer callbacks to localize failures
instead of relying solely on the global hooks.

## The platform health-checks `/api` — keep it cheap and always-200
Deployment logs showed `healthcheck failed ... /api returned status 500`. The platform
probes `/api`; with no router root handler it fell through to the production SPA
fallback's file I/O (`sendFile(index.html)`), which could intermittently 500 → VM marked
unhealthy → restart → outage.
**Decision:** give the api router a root `GET "/"` returning `{status:"ok"}`.
**Why:** a VM is only "healthy" if its probed endpoint reliably returns 200; a
flaky/expensive health path causes self-inflicted restarts.

## Open the HTTP port BEFORE slow boot work (DB restore / engine init)
A reported outage was actually a ~14s cold-start gap on every restart: `index.ts`
ran `await restoreConfigToDisk()` (a Postgres round-trip) BEFORE `app.listen()`, so
during boot the platform's `/api` probe got 500 (nothing listening) until the restore
finished — and a slow/cold DB widened the window.
**Decision:** `app.listen()` first; run `restoreConfigToDisk()` + `getBotInstance()` +
control-bot start in a background `bootstrap()` from the listen callback.
**Why:** health must pass within ~1s of process start; slow startup work must never gate
the port. Tradeoff: routes reading config files directly during the brief restore window
see defaults — acceptable vs. a guaranteed multi-second outage on every restart.
**How to apply:** any future boot-time async (migrations, warmup, reconnects) goes in
`bootstrap()` AFTER listen, never before it.

## Exactly ONE process handler per event
There were TWO `uncaughtException` handlers — one "log & keep alive", one `process.exit(1)`.
Node runs ALL listeners, so the exit one silently won and defeated the keep-alive policy,
turning every stray background error back into a restart (→ cold-start outage).
**How to apply:** register a single handler per `uncaughtException`/`unhandledRejection`;
if you want keep-alive, make sure nothing else exits on the same event.
