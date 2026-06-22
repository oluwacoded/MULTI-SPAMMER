---
name: Telegram control bot
description: A grammy Bot-API bot in api-server that drives the dashboard engines from Telegram; bundling + status-shape + auth gotchas.
---

# Telegram control bot

A second Telegram presence (Bot API via `grammy`) lets the owner run the dashboard from inside Telegram: status, WhatsApp QR + pairing-code link, WhatsApp campaign, Telegram scrape+mass-add, Gmail campaign. It is separate from the GramJS user-client engine — `grammy` is the Bot API, GramJS is MTProto user accounts; they coexist.

## Durable gotchas

- **`grammy` must be externalized in `build.mjs`** alongside `nodemailer`/`@whiskeysockets/baileys`. esbuild bundling of these is the established pattern here; add new runtime-heavy deps to the externals list or the bundle breaks.
- **Engine add-status field is `active`, not `running`.** `getBotInstance().getAddStatus()` and each `accounts[].addJob` snapshot expose `{active,total,added,failed,index,percent,targetsTotal,targetIndex,currentTarget,...}`. Checking `.running` silently always reads "no job".
  **Why:** an early version of the bot checked `.running` and never showed live progress.
- **Bot auth is fail-closed.** Requires a valid numeric `TELEGRAM_CONTROL_CHAT_ID`; if missing/NaN the bot refuses to start rather than running unrestricted (anyone who finds the bot could otherwise trigger campaigns/adds). Token in `TELEGRAM_CONTROL_BOT_TOKEN` (no token = silently disabled).
  **How to apply:** never make the owner-gate conditional on truthiness of a parsed id — `Number("")`/NaN must block.
- **`bot.start()` is a long-poll daemon — never `await` it.** It's launched fire-and-forget from `index.ts` after the engine boots, errors caught via `.catch` + `bot.catch`.
- **The SPA fallback in `app.ts` must exclude `/api/*`.** In production the path-less `index.html` fallback would otherwise serve the dashboard HTML for ANY unmatched API route, so an API client (the control bot) gets a `<!doctype html>` page instead of JSON and echoes it into chat. Unmatched `/api/*` must return a JSON 404. Dev doesn't reproduce this (fallback is prod-gated). The `api()` helper also rejects HTML responses defensively.
  **Why:** the Telegram bot once printed the whole dashboard HTML when it hit an unmatched/erroring endpoint.

## Multi-user model (single shared backend)
The bot is multi-user but everyone runs against **one backend = this server** (`BASE = http://127.0.0.1:PORT/api`). Roles by chat id (admin = `TELEGRAM_CONTROL_CHAT_ID`, user = redeemed an access code, guest = none). Access is gated by one-time codes the admin generates; `botUsers.ts` persists users+tokens via the configStore DB write-through.
- **Per-user backend URLs were tried and REMOVED** — users pasting their own (Railway) backend caused issues. Don't reintroduce a per-user `base`; keep the fixed loopback `BASE`. (This also removed the SSRF surface, so the `isAllowedBackend`/private-host guards are gone with it.)
- Guest gating is a second `bot.use` middleware after role resolution; only `/start`,`/menu`,`/redeem`,help, and the redeem flow pass for guests. Redeem has a per-chat brute-force throttle (6 tries / 10 min).
- Long-running "boards" (scrape+add, WhatsApp campaign) edit ONE message on a ~2.6–3s poll loop, run detached (not awaited), are 30-min bounded, and guarded by an `activeBoards` Set per chat. End with a downloadable results `.txt`.

## Run the control bot in ONE place only (dev/prod conflict)
Telegram allows a single long-poll consumer per bot token. The dev workspace workflow AND the deployed VM both boot api-server with the SAME `TELEGRAM_CONTROL_BOT_TOKEN`, so when the workspace was open both fought (409 Conflict) and crash-looped.
- **Fix:** `index.ts` only calls `startControlBot()` when `NODE_ENV === "production"` (deployment sets this) or `CONTROL_BOT_FORCE=1`. Dev logs "Control bot not started in development" and the GramJS engine still connects.
- The bot self-heals: after any polling stop it relaunches on a fixed delay (clearing the webhook first), so transient network drops recover on their own.
- Process error policy: `unhandledRejection` is logged and ignored (stray socket rejections are normal); `uncaughtException` logs then **exits** so the VM supervisor restarts a clean instance — never "log and keep running", which can limp along corrupted.
  **Why:** a dropped GramJS/Baileys socket shouldn't take the server down, but a truly uncaught error means unknown state — a fresh restart (which reconnects everything) is safer than continuing.
- **Changes only take effect after re-publishing the deployment.**

## WhatsApp pairing code
`whatsappEngine.requestPairingCode(phone)` brings the Baileys socket up (if needed), waits ~2s, then calls `sock.requestPairingCode(digits)`. Only works while unregistered/not-connected.
