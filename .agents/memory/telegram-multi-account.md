---
name: Telegram concurrent multi-account model
description: How the Telegram engine runs many accounts at once, and the non-obvious constraints when extending it.
---

# Telegram concurrent multi-account

The Telegram engine runs **every logged-in account connected simultaneously**, each
with its own scrape/add/campaign job. Per-account runtime state lives in
`Map<accountId, AccountSession>` in `botInstance.ts`. There is NO single-active
exclusivity anymore.

**`activeAccountId` is only a default-view fallback, not exclusivity.**
- **Why:** the engine was rebuilt from "single active connection" to true concurrency
  at the user's request (each account uses its own API key). Re-introducing any
  "only the active account is connected / can run jobs" assumption silently breaks
  parallel accounts.
- **How to apply:** when adding any scrape/add/campaign/login path, scope it by
  `accountId` (resolve via the session map) and only fall back to active when the
  caller omits it. Don't tear down other sessions on login/disconnect of one account.

**The generated `@workspace/api-client-react` client cannot carry per-request
`accountId` for the Telegram job endpoints.**
- **Why:** its campaign status URL has no query param, stop is a void mutation, and
  start only takes `{data}` — so it can't address a specific account.
- **How to apply:** account-scoped Telegram endpoints (campaign status/start/stop,
  add-status, etc.) use raw `apiGet/apiPost` from `src/lib/api.ts` with the
  `accountId` in the query (GET) or body (POST). Do NOT try to thread `accountId`
  through the generated hooks, and do NOT re-run Orval codegen (manual edits).

**New-account login must echo back the generated `accountId`.**
- **Why:** for a brand-new account (`createNew`), the backend generates the id, so the
  client doesn't know it yet; if `/login/code` & `/login/2fa` submit without it they
  fall back to "active", which is fragile under overlapping logins.
- **How to apply:** `/login/start` returns `accountId`; the Login page stores it in
  `target` before submitting code/2FA.
