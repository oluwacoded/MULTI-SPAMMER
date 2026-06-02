import crypto from "node:crypto";
import type { Request, Response, NextFunction } from "express";

function getSecret(): string {
  const secret = process.env["GW_JWT_SECRET"];
  if (!secret) {
    throw new Error("GW_JWT_SECRET environment variable is required");
  }
  return secret;
}

// ---- Password hashing (scrypt, no native deps) ----

export function hashPassword(plain: string): string {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(plain, salt, 64);
  return `scrypt$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export function verifyPassword(plain: string, stored: string): boolean {
  const parts = stored.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const salt = Buffer.from(parts[1]!, "base64");
  const hash = Buffer.from(parts[2]!, "base64");
  const test = crypto.scryptSync(plain, salt, hash.length);
  return hash.length === test.length && crypto.timingSafeEqual(hash, test);
}

// ---- Signed tokens (HS256, JWT-compatible) ----

export interface TokenPayload {
  sub: number;
  email: string;
  iat?: number;
  exp?: number;
}

const THIRTY_DAYS = 60 * 60 * 24 * 30;

export function signToken(
  payload: { sub: number; email: string },
  expiresInSec = THIRTY_DAYS,
): string {
  const header = { alg: "HS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const body = { ...payload, iat: now, exp: now + expiresInSec };
  const h = Buffer.from(JSON.stringify(header)).toString("base64url");
  const p = Buffer.from(JSON.stringify(body)).toString("base64url");
  const data = `${h}.${p}`;
  const sig = crypto
    .createHmac("sha256", getSecret())
    .update(data)
    .digest("base64url");
  return `${data}.${sig}`;
}

export function verifyToken(token: string): TokenPayload | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [h, p, sig] = parts;
  const data = `${h}.${p}`;
  const expected = crypto
    .createHmac("sha256", getSecret())
    .update(data)
    .digest("base64url");
  const a = Buffer.from(sig!);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  let payload: TokenPayload;
  try {
    payload = JSON.parse(Buffer.from(p!, "base64url").toString());
  } catch {
    return null;
  }
  if (payload.exp && Math.floor(Date.now() / 1000) > payload.exp) return null;
  return payload;
}

// ---- Auth middleware ----

export interface AuthedRequest extends Request {
  gwUser: { id: number; email: string };
}

export function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const raw = req.headers["authorization"];
  const auth = Array.isArray(raw) ? raw[0] : raw;
  const match = /^Bearer (.+)$/.exec(auth ?? "");
  if (!match) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  const payload = verifyToken(match[1]!);
  if (!payload || !payload.sub) {
    res.status(401).json({ error: "Invalid or expired session" });
    return;
  }
  (req as AuthedRequest).gwUser = {
    id: Number(payload.sub),
    email: payload.email,
  };
  next();
}

// ---- Simple in-memory rate limiter ----

const buckets = new Map<string, { count: number; reset: number }>();

export function rateLimit(opts: { windowMs: number; max: number }) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const key = `${req.ip ?? "anon"}:${req.path}`;
    const now = Date.now();
    let bucket = buckets.get(key);
    if (!bucket || now > bucket.reset) {
      bucket = { count: 0, reset: now + opts.windowMs };
      buckets.set(key, bucket);
    }
    bucket.count++;
    if (bucket.count > opts.max) {
      res
        .status(429)
        .json({ error: "Too many requests. Please slow down and try again." });
      return;
    }
    next();
  };
}
