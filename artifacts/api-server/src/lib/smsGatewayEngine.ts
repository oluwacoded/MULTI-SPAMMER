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
