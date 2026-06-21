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

## Turbo continues through PEER_FLOOD; safe stops (do not "fix" this)
The add loop's PEER_FLOOD branch sets `job.peerFloodStop` ONLY when `job.safeMode`
is true. In turbo (the default) it marks the member failed and continues to the
next — this is the ORIGINAL behavior the user relied on ("it kept adding through
the flood, 100→450"). A prior edit had made PEER_FLOOD hard-stop the whole job on
the first hit, which the user (correctly) reported as a regression vs. before.
**Why:** the user explicitly wants the keep-going behavior and accepts the higher
ban risk; stopping on the first flood made fresh accounts show "0 added" and quit.
**How to apply:** don't reintroduce an unconditional PEER_FLOOD stop. Keep it
gated behind safeMode. Note this does NOT bypass the limit — flagged accounts may
still add few/none — it just doesn't abort the run.

## Turbo default must be set in EVERY add-job init path
There are multiple job-init entry points (`startAddJob`, `startMultiSourceAddJob`)
that each independently seed `job.noCooldown`. `_addNext`'s delay is: safeMode →
SAFE_DELAY; else noCooldown → ~130–250ms (turbo); else → 2–5s. So a non-safe path
that leaves `noCooldown:false` silently runs at the SLOW 2–5s pace, not turbo.
**Why:** `startMultiSourceAddJob` once hardcoded `noCooldown:false`, quietly
downgrading the scrape-&-add flow off turbo — the exact "fast adding like before"
the user cares about. **How to apply:** every non-safe add path must set
`noCooldown: !safeMode` (or accept+pass the option); when adding a new add-job
init path, wire pacing the same way or it defaults to slow.
