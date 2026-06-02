# MFG Multi-Channel Outreach Bot

A multi-channel outreach toolkit with a React dashboard and an Express API. Send Telegram, SMS, Gmail, and WhatsApp campaigns; scrape Telegram group members; and manage contact lists — all from one UI.

## Features

- **Telegram** — login (phone + code + optional 2FA), bulk campaigns with per-recipient logs, and group member scraping via `GetParticipants`.
- **Gmail** — SMTP campaigns using a Gmail App Password, a visual block builder *and* a raw-HTML toggle with live preview, `{name}`/`{email}` personalization, saved templates, per-recipient logs, and campaign history with CSV export.
- **WhatsApp** — connect by scanning a QR code (Baileys), then run bulk campaigns with history.
- **SMS** — flash and standard SMS campaigns via configured providers.
- **Contacts** — save and reuse contact lists; import/export CSV.
- **Multi-server** — point the dashboard at any backend URL (stored in the browser), with an in-app server switcher and "add server" control.

## Project layout (pnpm monorepo)

```
artifacts/
  api-server/      Express + TypeScript API (@workspace/api-server)
  telegram-bot/    React + Vite + TanStack Query + shadcn/ui dashboard (@workspace/telegram-bot)
  mockup-sandbox/  Component preview server (development only)
lib/               Shared workspace packages (api client, zod schemas, etc.)
```

## Prerequisites

- Node.js 24+
- pnpm

## Getting started

```bash
pnpm install

# Run the API server (defaults to port 8080)
pnpm --filter @workspace/api-server run dev

# Run the dashboard
pnpm --filter @workspace/telegram-bot run dev
```

The dashboard talks to the API via same-origin `/api` requests by default. To point it at a different backend, use the server switcher in the UI (stored in `localStorage` as `mfg_api_base`).

## Configuration

Most settings are managed at runtime from the dashboard **Settings** page and persisted to `artifacts/api-server/data/settings.json` (gitignored):

- **Telegram API credentials** — `TG_API_ID` and `TG_API_HASH` (from <https://my.telegram.org>).
- **Gmail** — sender email, from-name, and a Gmail **App Password** (not your account password).
- **SMS providers** — provider credentials.

The only required environment variable is `PORT` for the API server.

## Runtime data

The API server writes runtime state under `artifacts/api-server/data/` (all gitignored):

- `settings.json` — saved credentials and config
- `tg_session.json` — Telegram session
- `whatsapp-auth/` — WhatsApp auth state
- `contact-lists/`, `email-campaign-history/`, `whatsapp-campaign-history/` — saved lists and logs

**Never commit these files** — they contain credentials and session secrets. They are already covered by `.gitignore`.

## Build

```bash
pnpm --filter @workspace/api-server run build      # bundle API to dist/
pnpm --filter @workspace/telegram-bot run build     # static build to dist/public/
```

## Security notes

- Use a Gmail **App Password**, never your main password.
- Keep `artifacts/api-server/data/` out of version control.
- Respect each platform's terms of service and anti-spam rules when sending bulk messages.
