---
name: Runtime config persistence in Postgres
description: Why the bot's JSON config (credentials, sessions, settings) must be mirrored to the DB, not just the data/ dir.
---

# Runtime config must persist in the DB, not just `data/` files

The `data/` dir is ephemeral on a Reserved-VM **republish** (fresh container, not part
of the build), so anything stored only there — Telegram logins, `api_id/api_hash`,
settings — is wiped on every redeploy. That forced re-login each deploy.

**Decision:** mirror all `readJSON`/`writeJSON` config to a Postgres key-value table so it
survives redeploys/restarts. The local filesystem is a cache, the DB is the source of truth.

**Why:** the DB persists across deploys; the VM filesystem does not.

**How to apply / constraints:**
- Durable config that must survive redeploys goes through `readJSON`/`writeJSON` (DB-backed).
  Never bypass with raw `fs` for credentials/sessions.
- The boot-time DB→disk restore MUST complete before the bot engine is constructed (its
  constructor reads config files synchronously).
- `@workspace/db` is a **composite** TS project: rebuild it (`tsc --build`) after schema edits
  or the api-server typecheck reads stale `.d.ts` and reports "no exported member".
- Still NOT DB-backed (dirs written via raw `fs`): WhatsApp `whatsapp-auth/`, `campaign-history/`.

# Secrets leak: `data/` was git-tracked

`artifacts/api-server/data/` (live Telegram session strings, api creds) was committed to git
because the `.gitignore` never actually excluded it. Sessions in history = full account access
if the repo is shared/forked. Keep `data/` ignored; untracking + history scrub + session
rotation requires destructive git ops (a separate task).
