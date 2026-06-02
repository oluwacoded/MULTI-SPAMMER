---
name: SMS Gateway SSRF guard
description: User-supplied device base URLs are used in server-side fetch and must be SSRF-validated at save time.
---

The SMS Gateway device record stores a user-controlled `smsgateBaseUrl` that the
backend later calls with server-side `fetch` (send + test-connection). Because
registration is open, an unvalidated base URL is a classic SSRF vector (point it
at localhost, `169.254.169.254` cloud metadata, or RFC1918 ranges).

**Rule:** validate and normalize the base URL at save time (POST/PATCH device),
return 400 on rejection — do not rely on the UI. Require `https`, reject
credentials in the URL, and reject localhost / `.local` / `.internal` /
IPv4 private+reserved (10/8, 127/8, 0/8, 169.254/16, 172.16-31, 192.168/16,
100.64/10 CGNAT, 224+) / IPv6 local (::1, fc/fd, fe80, ::ffff: mapped).

**Why:** an architect review flagged this as blocking; UI-only checks are
bypassable via direct API calls.

**How to apply:** `validateBaseUrl()` lives in `smsGatewayEngine.ts` and is the
single source of truth — call it from any route that persists a base URL.
