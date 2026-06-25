---
name: WhatsApp self-bot dot-commands
description: How the integrated WhatsApp engine handles `.`-prefixed commands; the emitOwnEvents trap, rememberMessage requirement, and state-file namespacing.
---

The integrated WhatsApp engine (`@workspace/api-server`, Baileys) responds to
`.`-prefixed **self-bot** commands. Commands live in `whatsappCommands.ts`
(`handleWhatsAppUpsert`), wired via `sock.ev.on("messages.upsert")` in
`whatsappEngine.ts`. Passive AI auto-reply / cover mode is intentionally NOT
ported — only explicit, user-invoked commands (incl. Groq "signature" commands).

## emitOwnEvents stays FALSE — do not flip it
Owner commands are gated on `msg.key.fromMe`. This works even though
`emitOwnEvents:false` because the owner's messages are typed on their PRIMARY
phone (a different device); WhatsApp syncs them to the linked bot as normal
`messages.upsert` with `fromMe:true` regardless of that flag.
**Why:** `emitOwnEvents` only controls whether *this socket's own* `sendMessage`
calls are locally re-emitted. Flipping it to true would echo every bot reply back
into the command handler (loop / double-processing risk).
**How to apply:** if owner commands ever "stop working", the fix is NOT
`emitOwnEvents:true` — check the phone is still a linked companion and the
fromMe/stale gating, not the flag.

## Any direct send must rememberMessage
With `emitOwnEvents:false`, outgoing messages never re-enter `messages.upsert`,
so `getMessage()` can't find them on a peer retry → the Bad-MAC/session-corruption
cascade returns. The text `send` helper remembers automatically; for ANY other
`sock.sendMessage` (media `.vv`, targeted `.send`, call auto-reject), wrap it in a
"send-and-remember" helper that stores the returned `{key,message}` via
`rememberMessage` (bounded to newest 1000).
**Why:** the whole engine is built around feeding real content back through
`getMessage` to stop Bad MAC; a forgotten direct send silently reopens that hole.

## Misc durable conventions
- WA command state files are namespaced `wa_*.json` (`wa_settings`, `wa_notes`,
  `wa_todos`, `wa_kv`) to avoid clobbering the Telegram engine's `settings.json` /
  `notes.json` in the shared `data/` dir. Written via the engine's DB-backed
  `writeJSON` (disk + `persistConfig`) so they survive redeploys.
- Groq signature commands degrade gracefully when `GROQ_API_KEY` is unset (reply
  telling the owner to configure it) — never throw.
- 60s stale guard (`messageTimestamp`) prevents re-running commands from a
  re-delivered backlog after a reconnect.
- Event handlers (upsert + call) are fully try/catch-wrapped: an unexpected
  Baileys payload must never crash the single VM process.
