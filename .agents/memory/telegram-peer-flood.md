---
name: Telegram PEER_FLOOD (add members) — no code bypass
description: What PEER_FLOOD is, why it can't be bypassed, and the only real mitigation (safe pacing).
---

## PEER_FLOOD cannot be bypassed in code
`PEER_FLOOD` (and the related add restrictions) is enforced by Telegram's
**servers** on the account, not by our client. When an account adds strangers to
groups too aggressively, Telegram flags it; further adds fail and continuing to
hammer escalates to a full account ban. No GramJS flag, header, or method turns
this off. SMM panels don't "bypass" it either — they spread small, slow batches
across pools of aged/warmed accounts. So the honest answer to "bypass the flood"
is: you can't; you can only avoid triggering it and let a flagged account recover
(message @SpamBot, then rest the account days).

## The only real lever: slow pacing + small per-run cap ("Safe mode")
The add engine supports a `safeMode` per job: long human-like gaps between adds
(~30–75s) and a per-run cap (~40 adds) after which it stops and tells the user to
rest the account or use another. This is the legitimate way to lower flag rate.
**Why:** add rate + volume per account per day is the dominant factor in getting
flagged; capping and slowing both down is what keeps healthy accounts healthy.
**How to apply:** the Scraper page exposes a Safe/Turbo toggle that passes
`safeMode` to all add endpoints; safe is the default. Turbo keeps the old
fast-as-Telegram-allows behavior for users who accept the ban risk.
