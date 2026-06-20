# MFG Multi-Channel Outreach Bot

A multi-channel outreach toolkit: a React dashboard plus an Express API for running Telegram, SMS, Gmail, and WhatsApp campaigns, scraping Telegram group members, and managing contact lists.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080; rebuilds on start)
- `pnpm --filter @workspace/telegram-bot run dev` — run the dashboard
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — build all packages
- Required env: `PORT` (API server). Most config is set at runtime via the Settings page.

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5, bundled with esbuild
- Frontend: React + Vite + TanStack Query + wouter + shadcn/ui + Tailwind
- Validation: Zod
- Telegram: GramJS; WhatsApp: Baileys; Email: nodemailer (Gmail SMTP)

## Where things live

- API routes: `artifacts/api-server/src/routes/` (`bot.ts`, `sms.ts`, `gmail.ts`, `whatsapp.ts`, `data.ts`, `health.ts`), mounted in `routes/index.ts`
- API engines/state: `artifacts/api-server/src/lib/` (`botInstance.ts`, `gmailEngine.ts`, `whatsappEngine.ts`)
- Runtime data (gitignored): `artifacts/api-server/data/` — `settings.json`, `tg_session.json`, `whatsapp-auth/`, contact lists, campaign history
- Frontend pages: `artifacts/telegram-bot/src/pages/`; API helper: `src/lib/api.ts`

## Architecture decisions

- Frontend reaches the API via same-origin `/api`. A multi-server switcher overrides the base URL via `localStorage` key `mfg_api_base`, applied by `src/lib/api.ts` (`apiGet/apiPost/apiDelete`). New pages use this helper; older pages use raw `fetch("/api/...")`.
- Baileys is dynamically `import()`-ed at runtime (ESM-only) and externalized in `build.mjs`.
- The generated client in `@workspace/api-client-react` has manual edits — do NOT re-run Orval codegen.
- Config/secrets are stored at runtime in `data/settings.json`, not env vars.
- Telegram is **concurrent multi-account**: every logged-in account stays connected at once and runs its OWN scrape/add/campaign job independently. Per-account runtime state lives in an in-memory `Map<accountId, AccountSession>` in `botInstance.ts` (client, me, connected, handlerRegistered, loginState, addJob, campaign, timers). Accounts are persisted in `data/tg_accounts.json` (`{accounts:[{id,label,apiId?,apiHash?,session,username,phone,name}], activeId}`); each can carry its own `api_id`/`api_hash`, else it falls back to the global admin keys in `tg_credentials.json`. `init()` reconnects ALL logged-in accounts on boot (sequential, error-isolated). `activeAccountId` is now only the **default-view fallback** (not exclusivity). Legacy `tg_session.json` migrates into "Account 1" on first boot. Account routes: `/api/tg-accounts` (GET/POST/PATCH/DELETE) + `/api/tg-accounts/:id/active`.
- All scrape/add/campaign/login/disconnect routes are **account-scoped**: they accept `accountId` (body for POST, query for GET) and fall back to the active account when omitted. `/bot/status` returns flat default fields (active account) PLUS `accounts:[{id,label,...,connected,loginState,addJob,campaign}]` — the same per-account shape served by `/tg-accounts`. The global AI/persona/rate-limit maps are rekeyed by `accountId:chatId`.
- Frontend: `useRunAccount` hook (`src/hooks/use-tg-accounts.ts`, localStorage key `mfg_run_account`, self-heals when the selected account disconnects) + `AccountSelector` component let each page pick which connected account runs its jobs; query keys include `accountId` (e.g. `["add-status",accountId]`, `["campaign-status",accountId]`). Campaign status/start/stop use raw `apiGet/apiPost` keyed by `accountId` because the generated client can't carry it.
- Login is async/stateful: `/login/start` (accepts `accountId` to re-login or `createNew` to add) kicks off GramJS and **returns the resolved `accountId`** (so a brand-new account's `/login/code` & `/login/2fa` target it, not whichever is active); those two routes also accept `accountId`. Logging in a new account never disconnects the others. The 2FA-vs-done outcome is reported via `loginState` (`idle|awaiting_code|awaiting_password|connected|error`) in `/bot/status`, which the Login page polls to drive the UI.
- **No app-level auth (by design/user request):** anyone who can reach the dashboard can use, switch, or remove every linked Telegram account. Keep the URL private.
- Group auto-add defaults to **turbo** (`noCooldown`): adds members back-to-back (no 2–5s countdown), keeps FLOOD_WAIT requeue, and stops the job on PEER_FLOOD.

## Product

Dashboard with pages for Telegram account management (link multiple accounts that all stay connected at once; per-page account picker chooses which connected account runs a given scrape/add/campaign, and several accounts can run their own jobs in parallel) + login, Telegram group scraping with turbo auto-add, Gmail campaigns (visual builder + raw HTML + live preview + templates + history/CSV), WhatsApp (QR connect + bulk campaign), SMS, contact lists, and settings (shared/global Telegram API credentials, per-account API keys with a parallel-job ban-risk warning, multi-server management).

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- `pnpm exec tsc --noEmit` in the frontend reports missing exports from `@workspace/api-client-react`; these are pre-existing (the generated package isn't built for tsc) and affect all pages. Vite resolves them at runtime.
- Do NOT re-run Orval codegen (manual edits in the generated client).
- Never commit `artifacts/api-server/data/` — it holds credentials and session secrets.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
