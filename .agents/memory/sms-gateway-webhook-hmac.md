---
name: SMS Gateway webhook HMAC raw-body coupling
description: Why inbound webhook signature verification depends on a global express.json verify callback
---

The SMS Gateway inbound webhook (`/api/gateway/webhook/:token`) verifies an optional
HMAC-SHA256 signature over the **exact raw request bytes**, not a re-serialized body.

**Rule:** The raw bytes are captured by the `verify` callback on `express.json()` in
`artifacts/api-server/src/app.ts`, which stashes them on `req.rawBody`. The webhook
handler reads `req.rawBody` for the HMAC. If you remove or change that `verify`
callback, signed webhooks fall back to `JSON.stringify(req.body)` and legitimate
signatures from the Android app can silently fail verification (401).

**Why:** HMAC must be computed over the sender's exact serialization; key ordering
and whitespace differ from `JSON.stringify`, so reconstructing the body breaks it.

**How to apply:** Keep the `express.json` `verify` callback intact. Any new
signature-verified webhook route should also rely on `req.rawBody`, not the parsed body.
