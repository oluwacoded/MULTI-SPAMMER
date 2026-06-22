import { Router } from "express";
import dns from "dns/promises";

const router = Router();

// ─── Shared helpers ───────────────────────────────────────────────────────────

// Run async work over a list with a fixed concurrency cap.
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let i = 0;
  const workers = new Array(Math.min(limit, items.length)).fill(0).map(async () => {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await fn(items[idx]!);
    }
  });
  await Promise.all(workers);
  return results;
}

function splitTokens(input: unknown): string[] {
  if (Array.isArray(input)) return input.map((x) => String(x));
  return String(input ?? "")
    .split(/[\s,;]+/)
    .map((t) => t.trim())
    .filter(Boolean);
}

// ─── Email verifier ───────────────────────────────────────────────────────────
// Validates each email's format + checks the domain actually has a mail server
// (MX record). No SMTP handshake — that's unreliable/often blocked — so this
// catches typos, dead domains and disposable addresses, not full-mailbox checks.

const EMAIL_RE = /^[^@\s]+@([^@\s]+\.[^@\s]+)$/;

const DISPOSABLE_DOMAINS = new Set([
  "mailinator.com", "10minutemail.com", "guerrillamail.com", "yopmail.com",
  "trashmail.com", "throwawaymail.com", "tempmail.com", "temp-mail.org",
  "getnada.com", "dispostable.com", "fakeinbox.com", "maildrop.cc",
  "sharklasers.com", "guerrillamailblock.com", "mailnesia.com", "mintemail.com",
]);

type EmailResult = {
  email: string;
  valid: boolean;
  status: "valid" | "invalid_format" | "disposable" | "no_mail_server" | "domain_not_found";
  reason: string;
};

async function verifyEmail(raw: string): Promise<EmailResult> {
  const email = raw.trim().toLowerCase();
  const m = email.match(EMAIL_RE);
  if (!m) return { email, valid: false, status: "invalid_format", reason: "Not a valid email format" };
  const domain = m[1]!;
  if (DISPOSABLE_DOMAINS.has(domain))
    return { email, valid: false, status: "disposable", reason: "Disposable / throwaway domain" };
  try {
    const mx = await dns.resolveMx(domain);
    if (mx && mx.length > 0)
      return { email, valid: true, status: "valid", reason: "Domain has a mail server" };
    return { email, valid: false, status: "no_mail_server", reason: "Domain can't receive email" };
  } catch {
    // No MX — maybe the domain still exists (some accept mail on the A record).
    try {
      await dns.lookup(domain);
      return { email, valid: false, status: "no_mail_server", reason: "Domain has no mail server" };
    } catch {
      return { email, valid: false, status: "domain_not_found", reason: "Domain does not exist" };
    }
  }
}

router.post("/tools/verify-emails", async (req, res) => {
  const list = [...new Set(splitTokens(req.body?.emails).map((e) => e.toLowerCase()))];
  if (!list.length) return res.status(400).json({ ok: false, message: "Provide one or more emails" });
  if (list.length > 5000)
    return res.status(400).json({ ok: false, message: "Too many at once (max 5000)" });

  const results = await mapLimit(list, 25, verifyEmail);
  const valid = results.filter((r) => r.valid);
  res.json({
    ok: true,
    total: results.length,
    validCount: valid.length,
    invalidCount: results.length - valid.length,
    results,
    validEmails: valid.map((r) => r.email),
  });
});

// ─── Website email scraper ────────────────────────────────────────────────────
// Fetches each site (plus a couple of likely contact pages) and pulls out any
// email addresses found in the HTML.

const SCRAPE_EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const ASSET_EXT_RE = /\.(png|jpe?g|gif|webp|svg|css|js|ico|woff2?|ttf)$/i;
const JUNK_EMAIL_DOMAINS = new Set([
  "example.com", "example.org", "sentry.io", "wixpress.com", "domain.com",
  "email.com", "yourdomain.com", "your-email.com", "sentry-next.wixpress.com",
]);

function normalizeUrl(input: string): URL | null {
  let s = input.trim();
  if (!s) return null;
  if (!/^https?:\/\//i.test(s)) s = "https://" + s;
  try {
    return new URL(s);
  } catch {
    return null;
  }
}

async function fetchHtml(url: string, ms = 12000): Promise<string> {
  try {
    const r = await fetch(url, {
      signal: AbortSignal.timeout(ms),
      redirect: "follow",
      headers: {
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
        accept: "text/html,application/xhtml+xml",
      },
    });
    if (!r.ok) return "";
    const ct = r.headers.get("content-type") || "";
    if (!ct.includes("text/html") && !ct.includes("text/plain")) return "";
    return await r.text();
  } catch {
    return "";
  }
}

function extractEmails(html: string, out: Set<string>) {
  // De-obfuscate the most common "name [at] domain [dot] com" patterns first.
  const deob = html
    .replace(/\s*\[?\(?\s*at\s*\)?\]?\s*/gi, "@")
    .replace(/\s*\[?\(?\s*dot\s*\)?\]?\s*/gi, ".");
  for (const text of [html, deob]) {
    const matches = text.match(SCRAPE_EMAIL_RE) || [];
    for (const raw of matches) {
      const e = raw.toLowerCase();
      if (ASSET_EXT_RE.test(e)) continue;
      const domain = e.split("@")[1] || "";
      if (JUNK_EMAIL_DOMAINS.has(domain)) continue;
      out.add(e);
    }
  }
}

async function scrapeSite(input: string): Promise<{ site: string; emails: string[]; error: string | null }> {
  const u = normalizeUrl(input);
  if (!u) return { site: input, emails: [], error: "Invalid URL" };
  const origin = u.origin;
  const pages = [
    u.href,
    `${origin}/contact`,
    `${origin}/contact-us`,
    `${origin}/about`,
    `${origin}/about-us`,
  ];
  const found = new Set<string>();
  for (const page of pages) {
    const html = await fetchHtml(page);
    if (html) extractEmails(html, found);
  }
  return { site: u.hostname, emails: [...found], error: found.size ? null : "No emails found" };
}

router.post("/tools/scrape-emails", async (req, res) => {
  const sites = [...new Set(splitTokens(req.body?.urls))];
  if (!sites.length) return res.status(400).json({ ok: false, message: "Provide one or more website URLs" });
  if (sites.length > 100)
    return res.status(400).json({ ok: false, message: "Too many at once (max 100)" });

  const results = await mapLimit(sites, 6, scrapeSite);
  const all = new Set<string>();
  for (const r of results) for (const e of r.emails) all.add(e);
  res.json({
    ok: true,
    sites: results.length,
    emailCount: all.size,
    results,
    allEmails: [...all],
  });
});

export default router;
