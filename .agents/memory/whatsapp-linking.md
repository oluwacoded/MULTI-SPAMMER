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

**UX is the real fix, not the handshake.** The backend handshake genuinely
completes (confirmed repeatedly in deploy logs: pairing configured → 515 → `✅
Connected as <number>`, staying linked until a *manual* Intentional Logout ~75s
later). The user kept seeing only the phone's misleading error and tapping Logout,
destroying the working session. So the control bot's pairing flow must POLL
`/whatsapp/status` after handing out the code and post an authoritative "✅ linked"
message, telling the user to ignore the phone error and NOT log out. Without that
confirmation the user has no positive signal and assumes failure.

**Also guard the Logout button.** The smoking gun is a manual `Intentional Logout`
(POST `/whatsapp/logout`) ~75s after a successful connect — the user taps the
control bot's one-tap Logout to "retry" after seeing the phone error, wiping a
working session. So the bot's `wa_logout` must check status first and require a
confirm tap when connected (fall through to immediate logout only when already
disconnected). Re-verified yet again this round: deploy logs show pairing→connected
in ~3s with NO 409/connectionReplaced; the engine also connects fine locally
(`connected to WA` + valid QR). The handshake is NOT the bug — never go looking for
one there; the fix space is the control-bot UX + getting the user to republish.

## The post-pairing 401/loggedOut IS part of the handshake — reconnect through it
**Confirmed by diffing the user's original working bot** (`server.js`
connection.update). WhatsApp emits a single `401`/`loggedOut` close event as PART
of the pair-success handshake, right before the `515` "restart required". If the
engine wipes `whatsapp-auth/` on ANY `loggedOut` code and does not reconnect, it
destroys the half-paired session at exactly that moment → the link never completes
(presents as "connects to the bot but not to WhatsApp").

**Decision logic (ported from the original):**
- Track `hasEverConnected` (true on `connection==="open"`) and `consecutive401s`.
- `credsAreDead = consecutive401s >= 3` (creds that keep 401ing, never open).
- `isPostPairRestart = !hasEverConnected && !credsAreDead` → NOT a real logout; reconnect FAST.
- `isRealLogout = (loggedOut && hasEverConnected) || credsAreDead` → only THEN wipe auth + stop.
- Reconnect immediately on `515` OR `isPostPairRestart`; short backoff otherwise; never on `440`.

**Gotcha — reset lifecycle state on EVERY auth clear.** `hasEverConnected` is
sticky. If it stays true after a logout/relink, a later re-pair in the SAME process
treats its first post-pair 401 as a real logout and wipes the new session
(re-creates the bug). Funnel every auth-destroying path (fresh relink, real-logout
wipe, `logout()`) through one `_clearAuth()` that resets `hasEverConnected=false`,
`consecutive401s=0`, `reconnectCount=0` (and `me`/`socketReady`).

**Stability: cache the signal keys.** Wrap `state.keys` in
`makeCacheableSignalKeyStore(keys, silentPinoLogger)` (keep `state.creds` raw).
Reading signal keys from disk on every decrypt races with `creds.update` writes and
makes libsignal reject the MAC ("Bad MAC"), dropping the session mid-handshake.
Match the original's `browser: Browsers.windows("Chrome")` fingerprint.

## DEFINITIVE death cause: WhatsApp REMOVES the device after a good connect
**Confirmed in production deploy logs**, not theory: pairing succeeds → `✅
Connected as <number>:<deviceId>@s.whatsapp.net` → the socket stays up ~1 min →
WhatsApp sends `stream errored code 401` with reasonNode `{tag:"conflict",
attrs:{type:"device_removed"}}` → session wiped. So the engine is NOT failing the
handshake and is NOT dropping the link itself — **WhatsApp (or the phone) unlinks
the device.** Baileys maps this 401 to `loggedOut`, and `isRealLogout` correctly
wipes (reconnecting with removed creds just 401-loops). This is the real meaning of
the user's "connects then dies after ~1 minute".

**Read the connected `me` id — the device counter is a churn/flag signal.** A `me`
of `<number>:90@s.whatsapp.net` means ~90 prior link/unlink cycles on that number.
Heavy churn + a datacenter IP (Replit/Railway) is exactly what makes WhatsApp
auto-remove freshly linked devices within ~1 min. No code change overrides a
server-side device removal; the levers are operational:
- Remove old/stale linked devices on the phone (WhatsApp → Linked Devices) before re-linking.
- Use a less-churned / aged number to test; let a flagged number rest (hours).
- Expect tighter limits from datacenter IPs regardless of code.

**Code mitigation = look like a real, healthy WhatsApp Web client.** The user's
original (working) bot stayed linked, so mirror its FULL socket config, not just the
browser string. Beyond `makeCacheableSignalKeyStore` + `Browsers.windows("Chrome")`,
set: `keepAliveIntervalMs` (jittered 20–30s, not a fixed bot-like beat),
`fireInitQueries:true`, `generateHighQualityLinkPreview:false`,
`transactionOpts:{maxCommitRetries:10,delayBetweenTriesMs:3000}`, and a REAL
`getMessage` backed by a bounded in-memory store of sent messages (key by the JID
WhatsApp stamps on the send: `sent.key.remoteJid||jid` + `::id`; fall back to
`proto.Message.fromObject({})`). The empty-getMessage default is what cascades into
"Bad MAC" session corruption. Clear that store in `_clearAuth()` so retry content
never leaks across relinks/numbers. Surface `lastError` (e.g. the device_removed
message) in the Telegram control bot's status text — it's the user's main UI.

**Fixes only reach the live VM on REPUBLISH.** Repeatedly the deploy logs showed the
OLD code (`Ubuntu` fingerprint) long after fixes were committed. End every WhatsApp
round by telling the user to republish, then re-pair on a clean number.

## Operational note: one bot token = one backend
The Telegram control bot runs *inside* the api-server. There is a single
`TELEGRAM_CONTROL_BOT_TOKEN`. Running the backend on Railway and Replit at the
same time means two `getUpdates` pollers fighting — stop one before starting the
other. For a long-lived WhatsApp socket, the Replit deployment must be a
Reserved VM (not autoscale, which spins down and kills the socket).
