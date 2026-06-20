---
name: Telegram multi-account + async login
description: How the Telegram engine handles multiple accounts and the async/stateful login flow, plus the stale-cache pitfall that bit us.
---

# Telegram multi-account model

- One engine, **one connected GramJS client at a time** (the "active" account). Accounts persist in `data/tg_accounts.json`. Each account may have its own `apiId`/`apiHash`, otherwise it falls back to the global admin keys (`tg_credentials.json`). Settings/AI/SMM stay global.
- Switching/removing/login serialize through a `_ready()` guard that awaits the constructor's `init()` reconnect, so route calls don't race startup.

# Async/stateful login (the important part)

GramJS `client.start()` cannot tell you synchronously whether a code will trigger a 2FA password prompt or complete the login — the `password` callback only fires later if 2FA is required. So:

- The engine exposes `loginState` (`idle|awaiting_code|awaiting_password|connected|error`) + `loginError` + `pendingLogin` via `/bot/status`. `/login/code` and `/login/2fa` just submit and return; they do NOT report the outcome.
- The frontend polls status and an effect drives `code → 2fa → done/error` off `loginState`.

**Why / the pitfall:** the frontend reads React Query's *cached* `loginState`. On an already-connected account, the cache can still say `connected` when a fresh login starts, which auto-completes the flow and skips the code step. Fix that bit us once: gate the transition effect with an **"armed" flag** that only trips once the backend reports the fresh login in progress (`pendingLogin` true or `loginState === awaiting_code/awaiting_password`), reset the flag when a new login starts, and invalidate status on `/login/start` success so it re-arms quickly.

**How to apply:** any time you drive UI state machines off a *polled* server flag that also has a meaningful "previous" value, require an explicit fresh-start observation (arming) before acting on terminal states — don't trust the first cached read.

# Add vs re-login

`startLogin(phone, {accountId?, createNew?, label?, apiId?, apiHash?})`. Pass `createNew:true` for "Add account" (always creates a new record); pass `accountId` for re-login. A bare phone with neither used to fall through to the active account and **overwrite its session** — always send `createNew` from the add flow.
