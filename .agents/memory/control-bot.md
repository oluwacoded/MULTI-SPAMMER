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

## WhatsApp pairing code
`whatsappEngine.requestPairingCode(phone)` brings the Baileys socket up (if needed), waits ~2s, then calls `sock.requestPairingCode(digits)`. Only works while unregistered/not-connected.
