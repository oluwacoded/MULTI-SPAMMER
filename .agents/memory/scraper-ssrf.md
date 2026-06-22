---
name: Scraper SSRF protection
description: Any server-side fetch of user-supplied URLs in this app must be SSRF-guarded; how the email scraper does it.
---

# Server-side URL fetching must be SSRF-guarded

Any endpoint that fetches a user-supplied URL server-side (currently `/tools/scrape-emails` in `artifacts/api-server/src/routes/tools.ts`) must resolve the host and reject non-public IPs, and must re-validate on every redirect hop.

**Why:** The dashboard has no app-level auth (see replit.md) and runs on a Reserved VM. An unguarded fetch lets anyone reach `localhost`, RFC1918 ranges, and the cloud metadata endpoint `169.254.169.254`, i.e. classic SSRF. A code review flagged this as blocking before first publish of the scraper.

**How to apply:**
- Allow only `http:`/`https:`.
- `dns.lookup(host, {all:true})` and block the IP if ANY resolved address is loopback/private/link-local/CGNAT/multicast/reserved (IPv4 and IPv6, incl. `::ffff:` mapped). Literal-IP hosts are checked directly.
- Use `redirect: "manual"` and re-run the host check on each `Location` before following (cap hops).
- Also cap the response body (stream-read with a byte limit + reject large `content-length`) to avoid memory exhaustion from a hostile endpoint.
- A blocked fetch just returns empty HTML (no emails), so it degrades quietly rather than erroring.
