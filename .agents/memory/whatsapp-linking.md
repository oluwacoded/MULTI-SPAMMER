---
name: WhatsApp "Couldn't link device" (Baileys)
description: Why WhatsApp rejects the link even when the backend says "connected", and how the engine must drive pairing/QR to maximize success.
---

# WhatsApp linking failures ("Couldn't link device. An error happened.")

This is a **WhatsApp-side rejection of the multi-device handshake**, shown on the
phone — independent of whether the backend reports `connected`. The backend can
say connected from a stale prior session while a *new* link attempt fails.

## Root causes (in rough priority)
1. **Stale / partial `whatsapp-auth/` creds.** The #1 code-fixable cause. Re-linking
   on top of leftover/unregistered creds makes WhatsApp reject the pairing. Always
   pair/relink from a **wiped, fresh, unregistered session**.
2. **No browser identity on the socket.** Set `browser: Browsers.ubuntu("Chrome")`
   on `makeWASocket`. Missing identity can get the pairing rejected.
3. **Requesting the pairing code too early.** Wait for the socket to actually be
   ready — gate on the first `qr` event (strongest signal it finished the noise
   handshake and is unregistered), not a fixed sleep or the weak `connecting` flag.
4. **Datacenter IP reputation.** Railway AND Replit are both datacenter IPs, so
   *moving hosts does not reliably fix this*. When pairing-code keeps failing, the
   QR scan is more reliable than the phone-number pairing code on hosted servers.
   WhatsApp also rate-limits repeated link attempts on a number — wait ~30 min.

Baileys version is usually NOT the cause if it's current (`@whiskeysockets/baileys`
7.0.0-rc13 was latest on npm as of 2026-06). Check before blaming the library.

## Socket lifecycle: the generation-token rule
**Why:** a fresh relink ends the old socket and opens a new one. The old socket's
`connection.update`/`creds.update` handlers and any scheduled reconnect `setTimeout`
keep firing and will null out the new socket, rewrite wiped creds, or resurrect a
connection after logout.

**How to apply:** keep a `generation` counter. Bump it BEFORE any teardown
(fresh relink AND logout). Each handler early-returns when its captured `myGen`
!== current generation. After every `await` in `connect()` (and before publishing
`this.sock`), re-check generation and discard the superseded socket. Reconnect
timers must capture `reconnectGen` and only reconnect if it still matches.

## "Couldn't link device" is often a FALSE alarm (post-pairing restart timeout)
**The pairing frequently succeeds server-side even when the phone shows the error.**
Check the deployment logs: if you see `pairing configured successfully` with a real
`me` id, then `stream errored ... code 515` (restart required), then it reconnects,
uploads pre-keys, and logs `✅ Connected as <number>`, the device DID link.

**Why the phone still errors:** code 515 fires right after pairing and the phone is
actively waiting on the link. If the backend takes too long to finish reconnecting
(slow reconnect delay + transient WebSocket retries + 800+ pre-key upload ≈ 15s),
the phone times out and shows "Couldn't link device. An error happened."

**Fix:** in the `connection.update` close handler, reconnect *immediately* (0ms) on
`DisconnectReason.restartRequired` (515) instead of the normal backoff, so the link
completes inside the phone's wait window. Also do NOT auto-reconnect on
`connectionReplaced` (440) — that means another login (e.g. a 2nd backend) took
over, and reconnecting just loops forever fighting it.

**Tell the user:** check WhatsApp → Linked devices for an "Ubuntu/Chrome" entry; if
it's there it linked despite the on-screen error. Deployment is already a Reserved
VM (`deploymentTarget = "vm"`), so the socket persists between requests.

## Operational note: one bot token = one backend
The Telegram control bot runs *inside* the api-server. There is a single
`TELEGRAM_CONTROL_BOT_TOKEN`. Running the backend on Railway and Replit at the
same time means two `getUpdates` pollers fighting — stop one before starting the
other. For a long-lived WhatsApp socket, the Replit deployment must be a
Reserved VM (not autoscale, which spins down and kills the socket).
