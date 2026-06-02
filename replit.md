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

## Product

Dashboard with pages for Telegram login/campaigns, Telegram group scraping, Gmail campaigns (visual builder + raw HTML + live preview + templates + history/CSV), WhatsApp (QR connect + bulk campaign), SMS, contact lists, and settings (Telegram API credentials, multi-server management).

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- `pnpm exec tsc --noEmit` in the frontend reports missing exports from `@workspace/api-client-react`; these are pre-existing (the generated package isn't built for tsc) and affect all pages. Vite resolves them at runtime.
- Do NOT re-run Orval codegen (manual edits in the generated client).
- Never commit `artifacts/api-server/data/` — it holds credentials and session secrets.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
