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

## Multi-tenant model
The bot is multi-user: roles by chat id (admin = `TELEGRAM_CONTROL_CHAT_ID`, user = redeemed an access code, guest = none). The bot is a thin HTTP CLIENT — every action proxies to a **per-user backend base URL** (`botUsers.ts`, persisted via the configStore DB write-through like the engine). Admin defaults to the built-in loopback backend (`http://127.0.0.1:PORT/api`); each non-admin sets their own (e.g. Railway) after redeeming.
- **SSRF guard is mandatory and non-obvious.** Because the server fetches the user-supplied backend URL, a non-admin could otherwise point it at `127.0.0.1`/private/metadata IPs and drive the admin's own backend or probe internal services. `isAllowedBackend()` forces non-admins to a **public https domain** (blocks loopback/RFC1918/link-local/CGNAT/bare-IP literals); admin is exempt. Enforce at BOTH set-time AND every request (middleware recomputes `ctx.base` and drops disallowed hosts so hand-edited config can't bypass it).
  **Why:** architect review flagged this as the one severe hole in the multi-user rebuild.
- Guest gating is a second `bot.use` middleware after role resolution; only `/start`,`/menu`,`/redeem`,help, and the redeem flow pass for guests. Redeem has a per-chat brute-force throttle (6 tries / 10 min).
- Long-running "boards" (scrape+add, WhatsApp campaign) edit ONE message on a ~2.6–3s poll loop, run detached (not awaited), are 30-min bounded, and guarded by an `activeBoards` Set per chat. End with a downloadable results `.txt`.

## WhatsApp pairing code
`whatsappEngine.requestPairingCode(phone)` brings the Baileys socket up (if needed), waits ~2s, then calls `sock.requestPairingCode(digits)`. Only works while unregistered/not-connected.
