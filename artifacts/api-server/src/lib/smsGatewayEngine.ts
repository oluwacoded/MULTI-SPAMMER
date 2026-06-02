import crypto from "node:crypto";
import { logger } from "./logger.js";

// Integration with the "SMS Gateway for Android" app (capcom6 / sms-gate.app).
// The phone runs the app in Cloud mode; this backend calls its REST API to send
// and receives webhooks for inbound messages + delivery status.

export interface GatewayCreds {
  baseUrl: string;
  login: string;
  password: string;
}

/**
 * Validate and normalize a user-supplied SMS Gateway base URL to prevent SSRF.
 * Requires https and rejects localhost / private / link-local / reserved hosts.
 * Returns the normalized URL (no trailing slash) or throws an Error with a
 * user-safe message.
 */
export function validateBaseUrl(raw: string): string {
  const value = String(raw ?? "").trim();
  if (!value) throw new Error("SMS Gateway URL is required.");
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("SMS Gateway URL is not a valid URL.");
  }
  if (url.protocol !== "https:") {
    throw new Error("SMS Gateway URL must use https.");
  }
  if (url.username || url.password) {
    throw new Error("SMS Gateway URL must not contain credentials.");
  }
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    host === "localhost" ||
    host === "0.0.0.0" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal")
  ) {
    throw new Error("SMS Gateway URL points to a disallowed host.");
  }
  if (isPrivateAddress(host)) {
    throw new Error("SMS Gateway URL points to a private or reserved address.");
  }
  // Strip a single trailing slash for consistent concatenation downstream.
  return url.toString().replace(/\/+$/, "");
}

/** True if the host is an IPv4/IPv6 literal in a private/reserved/link-local range. */
function isPrivateAddress(host: string): boolean {
  // IPv4 literal
  const v4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const o = v4.slice(1).map(Number);
    if (o.some((n) => n > 255)) return true;
    const [a, b] = o as [number, number, number, number];
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 0) return true;
    if (a === 169 && b === 254) return true; // link-local incl. cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    if (a >= 224) return true; // multicast / reserved
    return false;
  }
  // IPv6 literal
  if (host.includes(":")) {
    if (host === "::1" || host === "::") return true;
    if (host.startsWith("fc") || host.startsWith("fd")) return true; // unique local
    if (host.startsWith("fe80")) return true; // link-local
    if (host.startsWith("::ffff:")) {
      return isPrivateAddress(host.slice("::ffff:".length));
    }
    return false;
  }
  return false;
}

function authHeader(creds: GatewayCreds): string {
  return (
    "Basic " +
    Buffer.from(`${creds.login}:${creds.password}`).toString("base64")
  );
}

/** Normalize a phone number to a consistent E.164-ish form. */
export function normalizePhone(raw: string): string {
  if (!raw) return "";
  const trimmed = raw.trim();
  const hasPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/[^0-9]/g, "");
  if (!digits) return "";
  return hasPlus ? `+${digits}` : digits;
}

export interface SendResult {
  id: string | null;
  state: string | null;
  raw: unknown;
}

/** Send an SMS to one or more numbers via the gateway. */
export async function sendSms(
  creds: GatewayCreds,
  phoneNumbers: string[],
  message: string,
): Promise<SendResult> {
  const body = JSON.stringify({ message, phoneNumbers });
  const headers = {
    "Content-Type": "application/json",
    Authorization: authHeader(creds),
  };

  const endpoints = [`${creds.baseUrl}/message`, `${creds.baseUrl}/messages`];
  let lastErr = "";
  for (const url of endpoints) {
    let res: globalThis.Response;
    try {
      res = await fetch(url, { method: "POST", headers, body });
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e);
      continue;
    }
    if (res.status === 404) {
      lastErr = `404 at ${url}`;
      continue; // try the alternate path
    }
    const text = await res.text();
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }
    if (!res.ok) {
      throw new Error(
        `Gateway returned ${res.status}: ${text.slice(0, 300) || res.statusText}`,
      );
    }
    const obj = (data ?? {}) as Record<string, unknown>;
    return {
      id: (obj["id"] as string) ?? null,
      state: (obj["state"] as string) ?? null,
      raw: data,
    };
  }
  throw new Error(`Could not reach gateway. ${lastErr}`);
}

/** Verify credentials by hitting an authenticated read endpoint. */
export async function testConnection(
  creds: GatewayCreds,
): Promise<{ ok: boolean; message: string }> {
  try {
    const res = await fetch(`${creds.baseUrl}/webhooks`, {
      method: "GET",
      headers: { Authorization: authHeader(creds) },
    });
    if (res.status === 401 || res.status === 403) {
      return { ok: false, message: "Invalid gateway login or password." };
    }
    if (!res.ok && res.status !== 404) {
      return { ok: false, message: `Gateway returned ${res.status}.` };
    }
    return { ok: true, message: "Connection successful." };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Could not reach gateway.",
    };
  }
}

/**
 * Verify a webhook HMAC signature. capcom6 signs the raw body with HMAC-SHA256
 * using the configured secret. We compare hex digests (constant time).
 */
export function verifyWebhookSignature(
  secret: string,
  rawBody: string,
  signature: string | undefined,
): boolean {
  if (!signature) return false;
  const expected = crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex");
  const provided = signature.replace(/^sha256=/i, "").toLowerCase();
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export interface ParsedWebhook {
  event: string;
  messageId: string | null;
  phoneNumber: string | null;
  message: string | null;
}

export function parseWebhookEvent(body: unknown): ParsedWebhook {
  const root = (body ?? {}) as Record<string, unknown>;
  const event = String(root["event"] ?? root["type"] ?? "");
  const payload = (root["payload"] ?? root) as Record<string, unknown>;
  const recipients = payload["recipients"] as string[] | undefined;
  return {
    event,
    messageId:
      (payload["messageId"] as string) ??
      (payload["id"] as string) ??
      (root["id"] as string) ??
      null,
    phoneNumber:
      (payload["phoneNumber"] as string) ??
      (payload["phone"] as string) ??
      (recipients && recipients[0]) ??
      null,
    message:
      (payload["message"] as string) ?? (payload["text"] as string) ?? null,
  };
}

export function logGateway(msg: string, extra?: Record<string, unknown>): void {
  logger.info({ ...extra }, `[gateway] ${msg}`);
}
