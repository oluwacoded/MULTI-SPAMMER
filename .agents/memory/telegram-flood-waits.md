---
name: Telegram flood-wait visibility in add jobs
description: Why the member-add job can look "frozen/stopped" after one add, and how flood waits are surfaced.
---

# Telegram flood waits look like a frozen/stopped job

GramJS `TelegramClient` has a `floodSleepThreshold` (default 60s): any FLOOD_WAIT
≤ threshold is **silently slept through inside GramJS** — our code never sees it.

**Symptom:** the add job adds ~1 member then appears to freeze ("Adding members… 1
added", 0 failed, still active) with no countdown, which users read as "it stopped /
cut everything." It's actually Telegram throttling the account right after the first
invite (worse under turbo/no-cooldown back-to-back adds). A harder `PEER_FLOOD` makes
the job stop by design (continuing risks an account ban) — that path shows failed+1.

**How to apply / fix:** in the add loop only, temporarily set
`client.floodSleepThreshold = 0` around entity-resolve + invite so flood waits THROW
and reach our handler (sets `job.floodWait`, decrements index, schedules a retry →
the UI shows a live "Flood wait Xs" countdown), then restore the previous value in a
`finally`. Also re-throw FLOOD_WAIT from the inner `getEntity`/`ImportContacts`
catches instead of swallowing them.

**Do NOT** lower `floodSleepThreshold` globally / at client construction: scraping
(`getParticipants`) depends on GramJS auto-sleeping flood waits ("Sleeping for 23s on
flood wait (Caused by channels.GetParticipants)") and has no manual retry — disabling
auto-sleep there breaks scraping.

**Root cause is Telegram, not the app:** no tool can bypass Telegram's add limits.
Code can only make the wait visible and avoid hammering. Slower pacing (non-turbo)
gets flagged less often than back-to-back adds.
