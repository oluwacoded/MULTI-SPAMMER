// ─── Control-bot users & access tokens ───────────────────────────────────────
// Persists who may use the Telegram control bot, which backend each user points
// at, and the access codes the admin hands out. Written to data/bot_users.json
// AND write-through to the app_config DB table (via persistConfig) so it survives
// redeploys (the data/ dir itself is ephemeral).
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { persistConfig } from "./configStore";

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");
const FILE = "bot_users.json";
const FULL = path.join(DATA_DIR, FILE);

export interface BotUser {
  chatId: number;
  role: "admin" | "user";
  backendBase: string | null;
  username?: string;
  name?: string;
  redeemedAt?: number;
}

export interface AccessToken {
  token: string;
  createdAt: number;
  note?: string;
  usedBy?: number | null;
  usedAt?: number;
}

interface Store {
  users: Record<string, BotUser>;
  tokens: Record<string, AccessToken>;
}

let store: Store = { users: {}, tokens: {} };
let loaded = false;

function load(): void {
  if (loaded) return;
  try {
    if (fs.existsSync(FULL)) {
      const parsed = JSON.parse(fs.readFileSync(FULL, "utf8"));
      if (parsed && typeof parsed === "object") store = parsed;
    }
  } catch {
    /* ignore corrupt file — start fresh */
  }
  if (!store.users) store.users = {};
  if (!store.tokens) store.tokens = {};
  loaded = true;
}

function save(): void {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(FULL, JSON.stringify(store, null, 2));
  } catch {
    /* disk may be read-only in prod; DB write-through below is the source of truth */
  }
  persistConfig(FILE, store);
}

export function getUser(chatId: number): BotUser | undefined {
  load();
  return store.users[String(chatId)];
}

export function listUsers(): BotUser[] {
  load();
  return Object.values(store.users);
}

export function listTokens(): AccessToken[] {
  load();
  return Object.values(store.tokens);
}

export function generateToken(note?: string): string {
  load();
  const token = "MFG-" + crypto.randomBytes(4).toString("hex").toUpperCase();
  store.tokens[token] = { token, createdAt: Date.now(), note, usedBy: null };
  save();
  return token;
}

export function redeemToken(
  code: string,
  chatId: number,
  info: { username?: string; name?: string } = {},
): { ok: true } | { ok: false; error: "invalid" | "used" } {
  load();
  const token = (code || "").trim().toUpperCase();
  const rec = store.tokens[token];
  if (!rec) {
    // Allow an already-redeemed user to re-enter their own valid (used) code.
    return { ok: false, error: "invalid" };
  }
  if (rec.usedBy && rec.usedBy !== chatId) return { ok: false, error: "used" };
  rec.usedBy = chatId;
  rec.usedAt = Date.now();
  const existing = store.users[String(chatId)];
  store.users[String(chatId)] = {
    chatId,
    role: existing?.role === "admin" ? "admin" : "user",
    backendBase: existing?.backendBase ?? null,
    username: info.username ?? existing?.username,
    name: info.name ?? existing?.name,
    redeemedAt: existing?.redeemedAt ?? Date.now(),
  };
  save();
  return { ok: true };
}

export function setBackend(chatId: number, base: string, info: { username?: string; name?: string } = {}): void {
  load();
  const existing = store.users[String(chatId)];
  store.users[String(chatId)] = {
    chatId,
    role: existing?.role ?? "user",
    backendBase: base || null,
    username: info.username ?? existing?.username,
    name: info.name ?? existing?.name,
    redeemedAt: existing?.redeemedAt ?? Date.now(),
  };
  save();
}

export function removeUser(chatId: number): void {
  load();
  delete store.users[String(chatId)];
  // free any tokens that were bound to this user
  for (const t of Object.values(store.tokens)) {
    if (t.usedBy === chatId) {
      t.usedBy = null;
      t.usedAt = undefined;
    }
  }
  save();
}
