import crypto from "node:crypto";

// Minimal Flutterwave v3 client (Standard hosted checkout + verification).
// Docs: https://developer.flutterwave.com/docs/

const FLW_BASE = "https://api.flutterwave.com/v3";

export function getSecretKey(): string {
  const key = process.env["FLW_SECRET_KEY"];
  if (!key) throw new Error("FLW_SECRET_KEY environment variable is required");
  return key;
}

export function isConfigured(): boolean {
  return Boolean(process.env["FLW_SECRET_KEY"]);
}

export interface CreatePaymentArgs {
  txRef: string;
  amount: number;
  currency: string;
  redirectUrl: string;
  email: string;
  name?: string | null;
}

// Creates a hosted payment link the buyer is redirected to.
export async function createPayment(args: CreatePaymentArgs): Promise<string> {
  const res = await fetch(`${FLW_BASE}/payments`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getSecretKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      tx_ref: args.txRef,
      amount: args.amount,
      currency: args.currency,
      redirect_url: args.redirectUrl,
      customer: { email: args.email, name: args.name ?? undefined },
      customizations: { title: "MFG SMM Panel", description: "Wallet deposit" },
    }),
  });

  const data = (await res.json().catch(() => null)) as {
    status?: string;
    message?: string;
    data?: { link?: string };
  } | null;

  if (!res.ok || data?.status !== "success" || !data.data?.link) {
    throw new Error(data?.message ?? `Flutterwave payment init failed (${res.status})`);
  }
  return data.data.link;
}

export interface VerifiedTransaction {
  status: string; // "successful" when paid
  amount: number;
  currency: string;
  txRef: string;
}

// Verifies a transaction by Flutterwave transaction id.
export async function verifyTransaction(
  transactionId: string | number,
): Promise<VerifiedTransaction> {
  const res = await fetch(
    `${FLW_BASE}/transactions/${encodeURIComponent(String(transactionId))}/verify`,
    { headers: { Authorization: `Bearer ${getSecretKey()}` } },
  );

  const data = (await res.json().catch(() => null)) as {
    status?: string;
    message?: string;
    data?: { status?: string; amount?: number; currency?: string; tx_ref?: string };
  } | null;

  if (!res.ok || data?.status !== "success" || !data.data) {
    throw new Error(data?.message ?? `Flutterwave verify failed (${res.status})`);
  }

  return {
    status: String(data.data.status ?? "unknown"),
    amount: Number(data.data.amount ?? 0),
    currency: String(data.data.currency ?? ""),
    txRef: String(data.data.tx_ref ?? ""),
  };
}

// Validates a webhook's verif-hash header against the configured secret hash.
export function verifyWebhookSignature(headerHash: string | undefined): boolean {
  const expected = process.env["FLW_SECRET_HASH"];
  if (!expected || !headerHash) return false;
  const a = Buffer.from(headerHash);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
