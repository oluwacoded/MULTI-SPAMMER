---
name: Telegram run-account selection must be sticky
description: Why the per-page "run as account" selection must key off account existence, not connected-state
---

The per-page "run as account" selection (useRunAccount hook + AccountSelector) must
stay locked to the chosen account as long as that account still EXISTS in
/bot/status, and only auto-pick a different account when the selection is unset or
the account was actually removed.

**Why:** Telegram (GramJS) accounts briefly flip `connected:false` during a normal
reconnect — common in the middle of a heavy scrape/add. If selection resets whenever
the account isn't in the *connected* subset, the per-account status query key
(`["add-status", accountId]`, campaign keys, etc.) switches to a different account
mid-job, so the running job appears to "vanish" and the dashboard snaps back to
another account. Users perceive this as "scrape loads then cancels / goes blank."
This is the core multi-account interference symptom.

**How to apply:** In useRunAccount, the re-pick effect should `return` early when the
selected id is still present in `accounts` (regardless of connected flag). Only fall
back (prefer connected+active → connected → active → first) when nothing is selected
or the account was deleted. AccountSelector must also keep the currently-selected
account in its dropdown even while it shows disconnected, or the controlled Select
goes blank.

Note: API keys (api_id/api_hash) alone never connect an account — each linked account
still needs a one-time interactive phone+code login (code is delivered to that
account's Telegram app), so credentials cannot be provisioned headlessly by the agent.
