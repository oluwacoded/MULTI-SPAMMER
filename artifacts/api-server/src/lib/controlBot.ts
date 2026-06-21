// ─── Telegram Control Bot (multi-user) ───────────────────────────────────────
// A Telegram bot (Bot API, via grammy) that lets people drive the outreach tools
// from inside Telegram. It is a thin CLIENT: every action is proxied over HTTP to
// a *per-user backend*. The admin uses the built-in backend (this same server);
// each other user points the bot at their OWN deployment (e.g. a Railway link)
// after redeeming an access code, so their WhatsApp / Telegram / scraping all run
// on their own server — never mixed with the admin's.
//
// Roles are decided by chat id:
//   • Admin  = TELEGRAM_CONTROL_CHAT_ID — sees admin tools (generate codes, users).
//   • User   = redeemed an access code — sees normal tools, runs on their backend.
//   • Guest  = no access — can only redeem a code.
//
// Config (env / secrets):
//   TELEGRAM_CONTROL_BOT_TOKEN  — BotFather token (required; bot disabled if unset)
//   TELEGRAM_CONTROL_CHAT_ID    — admin chat id (required; bot refuses to run unset)
import { Bot, Keyboard, InlineKeyboard, InputFile } from "grammy";
import { logger } from "./logger";
import {
  getUser,
  redeemToken,
  generateToken,
  setBackend,
  listUsers,
  listTokens,
} from "./botUsers";

// The admin's built-in backend = this very server.
const ADMIN_DEFAULT = `http://127.0.0.1:${process.env.PORT || 8080}/api`;

// ─── Conversation state ──────────────────────────────────────────────────────
type FlowName =
  | "redeem_token"
  | "set_backend"
  | "wa_pair_phone"
  | "wa_campaign_msg"
  | "wa_campaign_nums"
  | "tg_scrape_source"
  | "tg_scrape_target"
  | "tg_login_phone"
  | "tg_login_code"
  | "tg_login_2fa"
  | "gmail_subject"
  | "gmail_body"
  | "gmail_recipients";

interface FlowState {
  flow: FlowName;
  data: Record<string, any>;
}
const flows = new Map<number, FlowState>();
const activeBoards = new Set<number>();
// Light brute-force guard for access-code redemption (per chat).
const redeemAttempts = new Map<number, { count: number; resetAt: number }>();

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ─── Buttons / keyboards ─────────────────────────────────────────────────────
const B = {
  status: "📊 Status",
  telegram: "✈️ Telegram",
  whatsapp: "📱 WhatsApp",
  gmail: "📧 Gmail",
  backend: "🌐 My Backend",
  help: "❓ Help",
  admin: "🛠 Admin",
  redeem: "🔑 Enter access code",
  cancel: "✖️ Cancel",
};

function mainKeyboard(isAdmin: boolean) {
  const k = new Keyboard()
    .text(B.status)
    .row()
    .text(B.telegram)
    .text(B.whatsapp)
    .row()
    .text(B.gmail)
    .text(B.backend)
    .row();
  if (isAdmin) k.text(B.admin).text(B.help);
  else k.text(B.help);
  return k.resized().persistent();
}
function guestKeyboard() {
  return new Keyboard().text(B.redeem).text(B.help).resized().persistent();
}
function cancelKeyboard() {
  return new Keyboard().text(B.cancel).resized().persistent();
}
function waMenu() {
  return new InlineKeyboard()
    .text("📷 Connect (QR)", "wa_qr")
    .text("🔢 Pairing code", "wa_pair")
    .row()
    .text("📣 Campaign", "wa_campaign")
    .text("📈 Status", "wa_status")
    .row()
    .text("🚪 Logout", "wa_logout");
}
function tgMenu() {
  return new InlineKeyboard()
    .text("🔎 Scrape + Add", "tg_scrape")
    .row()
    .text("➕ Link my account", "tg_link")
    .row()
    .text("📈 Add status", "tg_addstatus")
    .text("⏹ Stop add", "tg_stopadd")
    .row()
    .text("👥 My accounts", "tg_accounts");
}
function gmailMenu() {
  return new InlineKeyboard()
    .text("✉️ Send campaign", "gmail_send")
    .row()
    .text("📈 Status", "gmail_status");
}
function adminMenu() {
  return new InlineKeyboard()
    .text("🎟 New access code", "admin_token")
    .row()
    .text("👥 Users", "admin_users")
    .text("🎫 Codes", "admin_tokens");
}
function helpMenu() {
  return new InlineKeyboard()
    .text("🌐 Backend setup", "h_backend")
    .row()
    .text("✈️ Telegram scrape + add", "h_tg")
    .row()
    .text("📱 WhatsApp", "h_wa")
    .row()
    .text("📧 Gmail", "h_gmail")
    .row()
    .text("🔑 Access codes", "h_access");
}
function boardKb() {
  return new InlineKeyboard().text("⏹ Stop", "tg_stopadd");
}

// ─── Small helpers ───────────────────────────────────────────────────────────
function esc(s: any): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
function parseNumbers(text: string): { phone: string }[] {
  return text
    .split(/[\s,;]+/)
    .map((t) => t.trim())
    .filter((t) => /\d{6,}/.test(t))
    .map((phone) => ({ phone }));
}
function parseEmails(text: string): { email: string }[] {
  return text
    .split(/[\s,;]+/)
    .map((t) => t.trim())
    .filter((t) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(t))
    .map((email) => ({ email }));
}
function dataUrlToInputFile(dataUrl: string, name: string): InputFile {
  const b64 = dataUrl.replace(/^data:image\/\w+;base64,/, "");
  return new InputFile(Buffer.from(b64, "base64"), name);
}
function normalizeBase(input: string): string {
  let b = (input || "").trim();
  if (!b) return "";
  b = b.replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(b)) b = "https://" + b;
  if (!/\/api$/i.test(b)) b += "/api";
  return b;
}

// Block loopback / private / link-local / metadata addresses.
function isPrivateHost(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, "");
  if (h === "localhost" || h.endsWith(".localhost")) return true;
  if (h === "::1" || h === "::") return true;
  if (h.startsWith("fc") || h.startsWith("fd") || h.startsWith("fe80")) return true; // IPv6 ULA / link-local
  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    const a = +m[1],
      b = +m[2];
    if (a === 127 || a === 0 || a === 10) return true;
    if (a === 169 && b === 254) return true; // link-local + cloud metadata 169.254.169.254
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  }
  return false;
}

// Non-admins may only point at a PUBLIC https host (not the admin's own/local
// backend, not internal services, not a bare IP). Prevents SSRF + cross-tenant
// control. The admin is exempt (uses the built-in loopback backend).
function isAllowedBackend(url: string, isAdmin: boolean): boolean {
  if (isAdmin) return true;
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (u.protocol !== "https:") return false;
  const host = u.hostname;
  if (isPrivateHost(host)) return false;
  // Force a public domain — block bare IPv4/IPv6 literals.
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(":")) return false;
  return true;
}
function bar(pct: number): string {
  const n = Math.max(0, Math.min(10, Math.round(pct / 10)));
  return "▰".repeat(n) + "▱".repeat(10 - n);
}

// HTTP call to a user's backend; never throws — returns a JSON-ish object.
async function api(base: string, method: string, p: string, body?: any): Promise<any> {
  const url = base.replace(/\/+$/, "") + p;
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: body ? { "content-type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(35000),
    });
  } catch (e: any) {
    return { ok: false, message: "Can't reach your backend (" + (e?.message || e) + ")" };
  }
  const txt = await res.text();
  let json: any;
  try {
    json = txt ? JSON.parse(txt) : {};
  } catch {
    json = { ok: false, message: txt.slice(0, 300) };
  }
  if (json && typeof json === "object" && json.ok === undefined) json.ok = res.ok;
  return json;
}

// ─── Status text (fetched from the user's backend) ───────────────────────────
async function tgStatusText(base: string): Promise<string> {
  const s = await api(base, "GET", "/bot/status");
  if (s.ok === false) return "✈️ Telegram: " + esc(s.message || "unreachable");
  const accounts: any[] = s.accounts || [];
  if (!accounts.length)
    return "✈️ <b>Telegram</b>\nNo account linked yet. Tap ✈️ Telegram → ➕ Link my account.";
  return (
    "✈️ <b>Telegram accounts</b>\n" +
    accounts
      .map((a) => {
        const c = a.connected ? "🟢" : "⚪️";
        const j = a.addJob?.active ? ` — adding ${a.addJob.added}/${a.addJob.total}` : "";
        return `${c} <b>${esc(a.label || a.id)}</b>${esc(j)}`;
      })
      .join("\n")
  );
}
async function waStatusText(base: string): Promise<string> {
  const s = await api(base, "GET", "/whatsapp/status");
  if (s.ok === false) return "📱 WhatsApp: " + esc(s.message || "unreachable");
  const state = s.connected
    ? `🟢 Connected${s.me?.name ? " as " + esc(s.me.name) : ""}`
    : s.connecting
    ? "🟡 Connecting…"
    : "⚪️ Not connected";
  const camp = s.campaign?.active
    ? `\n📣 Campaign: ${s.campaign.sent}/${s.campaign.total} (${s.campaign.percent}%)`
    : "";
  return `📱 <b>WhatsApp</b>\n${state}${camp}`;
}
async function gmStatusText(base: string): Promise<string> {
  const s = await api(base, "GET", "/gmail/campaign/status");
  if (s.ok === false) return "📧 Gmail: " + esc(s.message || "unreachable");
  const cfg = s.configured ? "🟢 Configured" : "⚪️ Not configured (set it on the website)";
  const camp = s.active
    ? `\n✉️ Sending: ${s.sent}/${s.total} (${s.percent}%)`
    : s.total
    ? `\nLast run: ${s.sent} sent, ${s.failed} failed`
    : "";
  return `📧 <b>Gmail</b>\n${cfg}${camp}`;
}

// ─── Live "board" for Scrape + Add ───────────────────────────────────────────
function addBoardText(s: any, done = false): string {
  if (!s) return "⏳ Waiting for the backend…";
  const phase = s.scrapePhase
    ? "🔎 Scraping members…"
    : s.active
    ? "➕ Adding members"
    : "✅ Finished";
  const added = s.added || 0,
    failed = s.failed || 0,
    privacy = s.privacy || 0,
    total = s.total || 0;
  const handled = added + failed + privacy;
  const pct = total ? Math.min(100, Math.round((handled / total) * 100)) : 0;
  const log: any[] = s.log || [];
  const flood = log.some((e) =>
    /peer_flood|too many requests|flood/i.test(`${e.error || ""} ${e.msg || ""}`),
  );
  const lines = [`🧲 <b>Scrape &amp; Add</b> — ${phase}`, "━━━━━━━━━━━━━"];
  if (s.currentSource) lines.push(`📥 Source: <code>${esc(s.currentSource)}</code>`);
  if (s.currentTarget) {
    const tt = s.targetsTotal > 1 ? ` [${(s.targetIndex || 0) + 1}/${s.targetsTotal}]` : "";
    lines.push(`🎯 Target: <code>${esc(s.currentTarget)}</code>${tt}`);
  }
  if (total) lines.push(`${bar(pct)} ${pct}%  (${handled}/${total})`);
  lines.push(`✅ Added <b>${added}</b>   🚫 Privacy ${privacy}   ❌ Failed ${failed}`);
  if (s.floodWait > 0) lines.push(`⏳ Flood wait: ${s.floodWait}s — pausing to stay safe`);
  if (flood)
    lines.push(
      "⚠️ Telegram limit hit (PEER_FLOOD). The job stops to protect the account — rest it a few hours, then add fewer at a time.",
    );
  lines.push("━━━━━━━━━━━━━");
  const lastLog = log[log.length - 1];
  if (lastLog?.msg) lines.push(`<i>${esc(lastLog.msg)}</i>`);
  if (done) lines.push(`\n🏁 Done. ✅ ${added} added · 🚫 ${privacy} privacy · ❌ ${failed} failed.`);
  return lines.join("\n");
}

async function sendResultsFile(ctx: any, s: any): Promise<void> {
  const log: any[] = s?.log || [];
  if (!log.length) return;
  const section = (title: string, status: string) => {
    const items = log.filter((e) => e.status === status);
    if (!items.length) return "";
    return (
      `\n=== ${title} (${items.length}) ===\n` +
      items
        .map((e) =>
          `${e.username ? "@" + e.username : ""} ${e.name || ""}${e.error ? " — " + e.error : ""}`.trim(),
        )
        .join("\n")
    );
  };
  const body =
    `MFG — Scrape & Add results\n${new Date().toISOString()}\n` +
    `Added: ${s.added || 0}   Privacy: ${s.privacy || 0}   Failed: ${s.failed || 0}   Total: ${s.total || 0}\n` +
    section("ADDED", "added") +
    section("ALREADY IN GROUP", "already") +
    section("PRIVACY (couldn't add)", "privacy") +
    section("FAILED", "failed") +
    section("SKIPPED", "skipped") +
    `\n\n(Showing the last ${log.length} events.)`;
  try {
    await ctx.replyWithDocument(new InputFile(Buffer.from(body, "utf8"), "scrape-results.txt"), {
      caption: "📄 Full results — who was added and who wasn't.",
    });
  } catch (e) {
    logger.error({ err: e }, "results file");
  }
}

async function runAddBoard(ctx: any, base: string): Promise<void> {
  const chatId = ctx.chat.id;
  if (activeBoards.has(chatId)) {
    await ctx.reply("A live board is already running here. Tap ⏹ Stop first.");
    return;
  }
  activeBoards.add(chatId);
  try {
    const m = await ctx.reply("🧲 Starting…", { parse_mode: "HTML", reply_markup: boardKb() });
    const mid = m.message_id;
    let last = "";
    let s: any = null;
    const start = Date.now();
    while (Date.now() - start < 30 * 60 * 1000) {
      await sleep(2600);
      s = await api(base, "GET", "/scrape/add-status");
      const txt = addBoardText(s);
      if (txt !== last) {
        last = txt;
        try {
          await ctx.api.editMessageText(chatId, mid, txt, {
            parse_mode: "HTML",
            reply_markup: boardKb(),
          });
        } catch {
          /* "message not modified" etc. — ignore */
        }
      }
      if (s && s.active === false) break;
    }
    try {
      await ctx.api.editMessageText(chatId, mid, addBoardText(s, true), { parse_mode: "HTML" });
    } catch {}
    await sendResultsFile(ctx, s);
  } finally {
    activeBoards.delete(chatId);
  }
}

function waBoardText(s: any, done = false): string {
  if (!s) return "⏳ Waiting…";
  const sent = s.sent || 0,
    total = s.total || 0,
    failed = s.failed || 0;
  const pct = s.percent != null ? s.percent : total ? Math.round((sent / total) * 100) : 0;
  const lines = [
    "📣 <b>WhatsApp campaign</b>",
    "━━━━━━━━━━━━━",
    `${bar(pct)} ${pct}%`,
    `✅ Sent <b>${sent}</b> / ${total}   ❌ Failed ${failed}`,
  ];
  if (done) lines.push(`\n🏁 Done. ${sent} sent, ${failed} failed.`);
  return lines.join("\n");
}

async function runWaBoard(ctx: any, base: string): Promise<void> {
  const chatId = ctx.chat.id;
  if (activeBoards.has(chatId)) {
    await ctx.reply("A live board is already running here.");
    return;
  }
  activeBoards.add(chatId);
  try {
    const m = await ctx.reply("📣 Starting WhatsApp campaign…", { parse_mode: "HTML" });
    let last = "";
    let s: any = null;
    const start = Date.now();
    while (Date.now() - start < 30 * 60 * 1000) {
      await sleep(3000);
      s = await api(base, "GET", "/whatsapp/campaign/status");
      const txt = waBoardText(s);
      if (txt !== last) {
        last = txt;
        try {
          await ctx.api.editMessageText(chatId, m.message_id, txt, { parse_mode: "HTML" });
        } catch {}
      }
      if (s && s.active === false) break;
    }
    try {
      await ctx.api.editMessageText(chatId, m.message_id, waBoardText(s, true), { parse_mode: "HTML" });
    } catch {}
  } finally {
    activeBoards.delete(chatId);
  }
}

// Poll a freshly-started Telegram login until it resolves.
async function pollLogin(base: string, accountId: string, tries = 12): Promise<string> {
  for (let i = 0; i < tries; i++) {
    await sleep(2000);
    const s = await api(base, "GET", "/bot/status");
    const acc = (s.accounts || []).find((a: any) => a.id === accountId);
    const ls = acc?.loginState;
    if (ls === "connected" || ls === "awaiting_password" || ls === "error") return ls;
  }
  return "timeout";
}

// ─── Help texts (deliberately simple, step-by-step) ──────────────────────────
const HELP: Record<string, string> = {
  h_backend:
    "🌐 <b>Backend setup</b>\n\n" +
    "Your backend is the server that actually runs your jobs.\n\n" +
    "1) Deploy your own copy of the app (e.g. on Railway).\n" +
    "2) Copy its web link (looks like https://your-app.up.railway.app).\n" +
    "3) Here in the bot, tap 🌐 My Backend → ✏️ Change backend.\n" +
    "4) Paste the link and send it.\n\n" +
    "✅ When it says “reachable”, you're ready. The admin uses the built-in backend automatically.",
  h_tg:
    "✈️ <b>Telegram: Scrape + Add</b>\n\n" +
    "This copies members from one group and adds them to your group.\n\n" +
    "1) Tap ✈️ Telegram → 🔎 Scrape + Add.\n" +
    "2) Send the SOURCE group (the one to copy from), e.g. @somegroup\n" +
    "3) Send your TARGET group(s) (where to add people). For more than one, put each on a new line.\n" +
    "4) Watch the live board — it updates by itself and shows ✅ added, 🚫 privacy, ❌ failed.\n" +
    "5) At the end you get a file listing everyone.\n\n" +
    "⚠️ If you see “PEER_FLOOD”, Telegram is rate-limiting that account. Stop, wait a few hours, then add fewer people.\n\n" +
    "First link a Telegram account: ✈️ Telegram → ➕ Link my account.",
  h_wa:
    "📱 <b>WhatsApp</b>\n\n" +
    "Connect a number two ways:\n\n" +
    "• 📷 QR: tap Connect (QR). On your phone: WhatsApp → Settings → Linked devices → Link a device → scan.\n" +
    "• 🔢 Pairing code: tap Pairing code, send your number with country code (e.g. 15551234567). Then on the phone: Linked devices → Link with phone number → type the code.\n\n" +
    "Then 📣 Campaign:\n" +
    "1) Send the message ({name} becomes the contact's name).\n" +
    "2) Send the phone numbers (with country code), separated by spaces or new lines.\n" +
    "3) Watch the live board for progress.",
  h_gmail:
    "📧 <b>Gmail</b>\n\n" +
    "Set the Gmail address + app password on the website first.\n\n" +
    "1) Tap 📧 Gmail → ✉️ Send campaign.\n" +
    "2) Send the SUBJECT.\n" +
    "3) Send the BODY (plain text or HTML).\n" +
    "4) Send the recipient emails (spaces, commas, or new lines).\n" +
    "5) It starts sending — check 📊 Status for progress.",
  h_access:
    "🔑 <b>Access codes</b>\n\n" +
    "This bot is private. To use it you need a code from the admin.\n\n" +
    "• Got a code? Tap 🔑 Enter access code and paste it (or send /redeem CODE).\n" +
    "• Admins: tap 🛠 Admin → 🎟 New access code to create one, then send it to the person.\n\n" +
    "Each code works for one person.",
};

// ─── Bot wiring ──────────────────────────────────────────────────────────────
let _started = false;

export function startControlBot(): void {
  if (_started) return;
  const token = process.env["TELEGRAM_CONTROL_BOT_TOKEN"];
  if (!token) {
    logger.info("Control bot disabled (TELEGRAM_CONTROL_BOT_TOKEN not set)");
    return;
  }
  const ownerRaw = process.env["TELEGRAM_CONTROL_CHAT_ID"];
  const ownerId = ownerRaw ? Number(ownerRaw) : NaN;
  if (!Number.isFinite(ownerId)) {
    logger.error(
      "Control bot NOT started: TELEGRAM_CONTROL_CHAT_ID is missing or invalid (refusing to run without an admin)",
    );
    return;
  }
  _started = true;
  const bot = new Bot(token);

  const showMain = (ctx: any, text: string) =>
    ctx.reply(text, { parse_mode: "HTML", reply_markup: mainKeyboard(!!ctx.isAdmin) });

  const promptBackend = async (ctx: any) => {
    await ctx.reply(
      "🌐 First, set your backend server.\nPaste your own backend link (e.g. your Railway URL).",
      { reply_markup: new InlineKeyboard().text("✏️ Set backend", "set_backend") },
    );
  };

  // ── Middleware 1: resolve role + backend for this chat ──
  bot.use(async (ctx, next) => {
    const chatId = ctx.chat?.id;
    if (chatId == null) return;
    const isAdmin = chatId === ownerId;
    const u = getUser(chatId);
    (ctx as any).isAdmin = isAdmin;
    (ctx as any).access = isAdmin || !!u;
    const rawBase = isAdmin ? u?.backendBase || ADMIN_DEFAULT : u?.backendBase || "";
    // Runtime guard: never proxy to a disallowed host even if config was hand-edited.
    (ctx as any).base = rawBase && isAllowedBackend(rawBase, isAdmin) ? rawBase : "";
    await next();
  });

  // ── Middleware 2: gate guests (no access) ──
  bot.use(async (ctx, next) => {
    if ((ctx as any).access) return next();
    if (ctx.callbackQuery) {
      try {
        await ctx.answerCallbackQuery({ text: "Enter an access code first.", show_alert: true });
      } catch {}
      return;
    }
    const txt = (ctx.message as any)?.text?.trim() || "";
    const inRedeem = flows.get(ctx.chat!.id)?.flow === "redeem_token";
    if (
      txt.startsWith("/start") ||
      txt.startsWith("/menu") ||
      txt.startsWith("/redeem") ||
      txt === B.redeem ||
      txt === B.help ||
      inRedeem
    )
      return next();
    await ctx.reply(
      "🔒 This bot is private.\nTap “" + B.redeem + "” and paste the code the admin gave you (or send /redeem CODE).",
      { reply_markup: guestKeyboard() },
    );
  });

  const doRedeem = async (ctx: any, code: string) => {
    const now = Date.now();
    const ra = redeemAttempts.get(ctx.chat.id);
    if (ra && now < ra.resetAt && ra.count >= 6) {
      await ctx.reply("⏳ Too many tries. Wait a few minutes, then try the code again.", {
        reply_markup: guestKeyboard(),
      });
      return;
    }
    const name = [ctx.from?.first_name, ctx.from?.last_name].filter(Boolean).join(" ");
    const r = redeemToken(code, ctx.chat.id, { username: ctx.from?.username, name });
    if (!r.ok) {
      if (!ra || now >= ra.resetAt)
        redeemAttempts.set(ctx.chat.id, { count: 1, resetAt: now + 10 * 60 * 1000 });
      else ra.count++;
      await ctx.reply(
        r.error === "used" ? "❌ That code was already used by someone else." : "❌ Invalid code. Double-check and try again.",
        { reply_markup: guestKeyboard() },
      );
      return;
    }
    redeemAttempts.delete(ctx.chat.id);
    (ctx as any).access = true;
    (ctx as any).isAdmin = ctx.chat.id === ownerId;
    await ctx.reply(
      "✅ Access granted!\n\nNext step: tap “" +
        B.backend +
        "” and paste your backend link so the bot knows where to run your jobs.",
      { parse_mode: "HTML", reply_markup: mainKeyboard(!!(ctx as any).isAdmin) },
    );
  };

  // ── Commands ──
  bot.command(["start", "menu"], async (ctx) => {
    flows.delete(ctx.chat.id);
    if (!(ctx as any).access) {
      await ctx.reply(
        "👋 Welcome to <b>MFG Bot</b>.\nThis bot is private — you need an access code.\n\nTap “" +
          B.redeem +
          "” below and paste the code the admin gave you.",
        { parse_mode: "HTML", reply_markup: guestKeyboard() },
      );
      return;
    }
    await showMain(
      ctx,
      "🤖 <b>MFG Control Bot</b>\nPick an option below. New here? Tap " + B.help + " for simple steps.",
    );
  });

  bot.command("redeem", async (ctx) => {
    const arg = ctx.match?.toString().trim();
    if (arg) {
      flows.delete(ctx.chat.id);
      await doRedeem(ctx, arg);
      return;
    }
    flows.set(ctx.chat.id, { flow: "redeem_token", data: {} });
    await ctx.reply("Paste your access code:", { reply_markup: cancelKeyboard() });
  });

  bot.command("cancel", async (ctx) => {
    flows.delete(ctx.chat.id);
    if ((ctx as any).access) await showMain(ctx, "Cancelled.");
    else await ctx.reply("Cancelled.", { reply_markup: guestKeyboard() });
  });

  // ── Reply-keyboard buttons ──
  bot.hears(B.cancel, async (ctx) => {
    flows.delete(ctx.chat.id);
    if ((ctx as any).access) await showMain(ctx, "Cancelled.");
    else await ctx.reply("Cancelled.", { reply_markup: guestKeyboard() });
  });

  bot.hears(B.redeem, async (ctx) => {
    if ((ctx as any).access) {
      await showMain(ctx, "You already have access. ✅");
      return;
    }
    flows.set(ctx.chat.id, { flow: "redeem_token", data: {} });
    await ctx.reply("Paste your access code:", { reply_markup: cancelKeyboard() });
  });

  bot.hears(B.help, async (ctx) => {
    await ctx.reply(
      "<b>How to use this bot</b>\nTap a topic for simple step-by-step instructions:",
      { parse_mode: "HTML", reply_markup: helpMenu() },
    );
  });

  bot.hears(B.status, async (ctx) => {
    const base = (ctx as any).base;
    if (!base) return promptBackend(ctx);
    await ctx.reply("⏳ Checking your backend…");
    const txt = [await tgStatusText(base), await waStatusText(base), await gmStatusText(base)].join(
      "\n\n",
    );
    await ctx.reply(txt, { parse_mode: "HTML" });
  });

  bot.hears(B.telegram, async (ctx) => {
    const base = (ctx as any).base;
    if (!base) return promptBackend(ctx);
    await ctx.reply(await tgStatusText(base), { parse_mode: "HTML", reply_markup: tgMenu() });
  });

  bot.hears(B.whatsapp, async (ctx) => {
    const base = (ctx as any).base;
    if (!base) return promptBackend(ctx);
    await ctx.reply(await waStatusText(base), { parse_mode: "HTML", reply_markup: waMenu() });
  });

  bot.hears(B.gmail, async (ctx) => {
    const base = (ctx as any).base;
    if (!base) return promptBackend(ctx);
    await ctx.reply(await gmStatusText(base), { parse_mode: "HTML", reply_markup: gmailMenu() });
  });

  bot.hears(B.backend, async (ctx) => {
    const u = getUser(ctx.chat.id);
    const cur = (ctx as any).isAdmin
      ? u?.backendBase || ADMIN_DEFAULT + " (built-in)"
      : u?.backendBase || "— not set —";
    await ctx.reply(
      "🌐 <b>Your backend</b>\nCurrent: <code>" +
        esc(cur) +
        "</code>\n\nThis is the server that runs your WhatsApp + scraping jobs. " +
        ((ctx as any).isAdmin
          ? "You use the built-in one by default."
          : "Paste your own backend link (e.g. a Railway URL)."),
      { parse_mode: "HTML", reply_markup: new InlineKeyboard().text("✏️ Change backend", "set_backend") },
    );
  });

  bot.hears(B.admin, async (ctx) => {
    if (!(ctx as any).isAdmin) return;
    await ctx.reply("🛠 <b>Admin</b>", { parse_mode: "HTML", reply_markup: adminMenu() });
  });

  // ── Help topic callbacks ──
  for (const key of Object.keys(HELP)) {
    bot.callbackQuery(key, async (ctx) => {
      await ctx.answerCallbackQuery();
      await ctx.reply(HELP[key], { parse_mode: "HTML" });
    });
  }

  // ── Backend set callback ──
  bot.callbackQuery("set_backend", async (ctx) => {
    await ctx.answerCallbackQuery();
    flows.set(ctx.chat!.id, { flow: "set_backend", data: {} });
    await ctx.reply("Paste your backend link (e.g. https://your-app.up.railway.app):", {
      reply_markup: cancelKeyboard(),
    });
  });

  // ── Admin callbacks ──
  bot.callbackQuery("admin_token", async (ctx) => {
    await ctx.answerCallbackQuery();
    if (!(ctx as any).isAdmin) return;
    const t = generateToken();
    await ctx.reply(
      "🎟 New access code:\n<code>" +
        esc(t) +
        "</code>\n\nSend it to the person. They tap 🔑 Enter access code and paste it (works once).",
      { parse_mode: "HTML" },
    );
  });

  bot.callbackQuery("admin_users", async (ctx) => {
    await ctx.answerCallbackQuery();
    if (!(ctx as any).isAdmin) return;
    const users = listUsers();
    if (!users.length) {
      await ctx.reply("No users have redeemed a code yet.");
      return;
    }
    const lines = users.map((u) => {
      const who = u.username ? "@" + u.username : u.name || String(u.chatId);
      const be = u.backendBase ? "🌐 set" : "⚪️ no backend";
      return `• ${esc(who)} (${u.chatId}) — ${be}`;
    });
    await ctx.reply("👥 <b>Users</b>\n" + lines.join("\n"), { parse_mode: "HTML" });
  });

  bot.callbackQuery("admin_tokens", async (ctx) => {
    await ctx.answerCallbackQuery();
    if (!(ctx as any).isAdmin) return;
    const tokens = listTokens();
    const unused = tokens.filter((t) => !t.usedBy);
    const used = tokens.filter((t) => t.usedBy);
    const lines = [
      `🎫 <b>Access codes</b> — ${unused.length} unused, ${used.length} used`,
      ...unused.slice(0, 30).map((t) => `🟢 <code>${esc(t.token)}</code>`),
    ];
    await ctx.reply(lines.join("\n"), { parse_mode: "HTML" });
  });

  // ── WhatsApp callbacks ──
  bot.callbackQuery("wa_status", async (ctx) => {
    await ctx.answerCallbackQuery();
    const base = (ctx as any).base;
    if (!base) return promptBackend(ctx);
    await ctx.reply(await waStatusText(base), { parse_mode: "HTML", reply_markup: waMenu() });
  });

  bot.callbackQuery("wa_qr", async (ctx) => {
    await ctx.answerCallbackQuery();
    const base = (ctx as any).base;
    if (!base) return promptBackend(ctx);
    const st = await api(base, "GET", "/whatsapp/status");
    if (st.connected) {
      await ctx.reply("🟢 WhatsApp is already connected.");
      return;
    }
    await ctx.reply("⏳ Generating QR… open WhatsApp → Linked devices → Link a device.");
    await api(base, "POST", "/whatsapp/connect");
    let sent = false;
    for (let i = 0; i < 12; i++) {
      await sleep(2200);
      const s = await api(base, "GET", "/whatsapp/status");
      if (s.connected) {
        await ctx.reply("🟢 Connected!");
        sent = true;
        break;
      }
      if (s.qr) {
        try {
          await ctx.replyWithPhoto(dataUrlToInputFile(s.qr, "wa-qr.png"), {
            caption: "Scan within ~20s. If it expires, tap Connect again.",
          });
          sent = true;
          break;
        } catch (e) {
          logger.error({ err: e }, "send wa qr");
        }
      }
    }
    if (!sent) await ctx.reply("Couldn't get a QR. Try again or use a pairing code.");
  });

  bot.callbackQuery("wa_pair", async (ctx) => {
    await ctx.answerCallbackQuery();
    const base = (ctx as any).base;
    if (!base) return promptBackend(ctx);
    const st = await api(base, "GET", "/whatsapp/status");
    if (st.connected) {
      await ctx.reply("🟢 WhatsApp is already connected.");
      return;
    }
    flows.set(ctx.chat!.id, { flow: "wa_pair_phone", data: {} });
    await ctx.reply("Send your WhatsApp number with country code (e.g. 15551234567):", {
      reply_markup: cancelKeyboard(),
    });
  });

  bot.callbackQuery("wa_campaign", async (ctx) => {
    await ctx.answerCallbackQuery();
    const base = (ctx as any).base;
    if (!base) return promptBackend(ctx);
    const st = await api(base, "GET", "/whatsapp/status");
    if (!st.connected) {
      await ctx.reply("Connect WhatsApp first (QR or pairing code).");
      return;
    }
    flows.set(ctx.chat!.id, { flow: "wa_campaign_msg", data: {} });
    await ctx.reply("Send the message to broadcast. You can use {name} as a placeholder.", {
      reply_markup: cancelKeyboard(),
    });
  });

  bot.callbackQuery("wa_logout", async (ctx) => {
    await ctx.answerCallbackQuery();
    const base = (ctx as any).base;
    if (!base) return promptBackend(ctx);
    await api(base, "POST", "/whatsapp/logout");
    await ctx.reply("🚪 WhatsApp logged out.");
  });

  // ── Telegram callbacks ──
  bot.callbackQuery("tg_accounts", async (ctx) => {
    await ctx.answerCallbackQuery();
    const base = (ctx as any).base;
    if (!base) return promptBackend(ctx);
    await ctx.reply(await tgStatusText(base), { parse_mode: "HTML", reply_markup: tgMenu() });
  });

  bot.callbackQuery("tg_addstatus", async (ctx) => {
    await ctx.answerCallbackQuery();
    const base = (ctx as any).base;
    if (!base) return promptBackend(ctx);
    const s = await api(base, "GET", "/scrape/add-status");
    if (!s || s.active === false || s.active === undefined) {
      await ctx.reply("No add job running right now.");
      return;
    }
    await ctx.reply(addBoardText(s), { parse_mode: "HTML" });
  });

  bot.callbackQuery("tg_stopadd", async (ctx) => {
    await ctx.answerCallbackQuery();
    const base = (ctx as any).base;
    if (!base) return promptBackend(ctx);
    await api(base, "POST", "/scrape/add-stop", {});
    await ctx.reply("⏹ Add job stopped.");
  });

  bot.callbackQuery("tg_scrape", async (ctx) => {
    await ctx.answerCallbackQuery();
    const base = (ctx as any).base;
    if (!base) return promptBackend(ctx);
    flows.set(ctx.chat!.id, { flow: "tg_scrape_source", data: {} });
    await ctx.reply(
      "Send the SOURCE group to scrape members FROM (e.g. @group or https://t.me/group):",
      { reply_markup: cancelKeyboard() },
    );
  });

  bot.callbackQuery("tg_link", async (ctx) => {
    await ctx.answerCallbackQuery();
    const base = (ctx as any).base;
    if (!base) return promptBackend(ctx);
    flows.set(ctx.chat!.id, { flow: "tg_login_phone", data: {} });
    await ctx.reply(
      "Let's link YOUR Telegram account.\nSend your phone number with country code (e.g. +15551234567):",
      { reply_markup: cancelKeyboard() },
    );
  });

  // ── Gmail callbacks ──
  bot.callbackQuery("gmail_status", async (ctx) => {
    await ctx.answerCallbackQuery();
    const base = (ctx as any).base;
    if (!base) return promptBackend(ctx);
    await ctx.reply(await gmStatusText(base), { parse_mode: "HTML", reply_markup: gmailMenu() });
  });

  bot.callbackQuery("gmail_send", async (ctx) => {
    await ctx.answerCallbackQuery();
    const base = (ctx as any).base;
    if (!base) return promptBackend(ctx);
    const s = await api(base, "GET", "/gmail/campaign/status");
    if (!s.configured) {
      await ctx.reply("Gmail isn't configured yet — set the email + app password on the website.");
      return;
    }
    flows.set(ctx.chat!.id, { flow: "gmail_subject", data: {} });
    await ctx.reply("Send the email SUBJECT:", { reply_markup: cancelKeyboard() });
  });

  // ── Free-text: drive the active flow ──
  bot.on("message:text", async (ctx) => {
    const chatId = ctx.chat.id;
    const text = ctx.message.text.trim();
    const state = flows.get(chatId);
    if (!state) return;
    const base = (ctx as any).base as string;

    try {
      switch (state.flow) {
        case "redeem_token": {
          flows.delete(chatId);
          await doRedeem(ctx, text);
          break;
        }

        case "set_backend": {
          flows.delete(chatId);
          const nb = normalizeBase(text);
          if (!nb) {
            await showMain(ctx, "That didn't look like a link. Try again from " + B.backend + ".");
            break;
          }
          if (!isAllowedBackend(nb, !!(ctx as any).isAdmin)) {
            await showMain(
              ctx,
              "❌ For security, your backend must be a <b>public https link</b> — not localhost, an internal/private address, or a bare IP.\nExample: <code>https://your-app.up.railway.app</code>",
            );
            break;
          }
          await ctx.reply("⏳ Checking the link…");
          const test = await api(nb, "GET", "/bot/status");
          setBackend(chatId, nb, {
            username: ctx.from?.username,
            name: [ctx.from?.first_name, ctx.from?.last_name].filter(Boolean).join(" "),
          });
          (ctx as any).base = nb;
          if (test.ok === false)
            await showMain(
              ctx,
              "Saved your backend, but I couldn't reach it yet:\n<code>" +
                esc(test.message || "") +
                "</code>\nMake sure it's deployed and the link is correct.",
            );
          else await showMain(ctx, "✅ Backend set and reachable:\n<code>" + esc(nb) + "</code>");
          break;
        }

        case "wa_pair_phone": {
          flows.delete(chatId);
          if (!base) {
            await promptBackend(ctx);
            break;
          }
          await ctx.reply("⏳ Requesting pairing code…");
          const r = await api(base, "POST", "/whatsapp/pair", { phone: text });
          if (r.ok && r.code)
            await ctx.reply(
              "🔢 Pairing code: <b>" +
                esc(r.code) +
                "</b>\n\nOn your phone: WhatsApp → Linked devices → Link with phone number → enter this code.",
              { parse_mode: "HTML", reply_markup: mainKeyboard(!!(ctx as any).isAdmin) },
            );
          else await showMain(ctx, "❌ " + esc(r.message || "Couldn't get a pairing code."));
          break;
        }

        case "wa_campaign_msg": {
          state.data.message = text;
          state.flow = "wa_campaign_nums";
          await ctx.reply(
            "Now send the phone numbers (with country code), separated by spaces, commas or new lines:",
            { reply_markup: cancelKeyboard() },
          );
          break;
        }

        case "wa_campaign_nums": {
          flows.delete(chatId);
          if (!base) {
            await promptBackend(ctx);
            break;
          }
          const contacts = parseNumbers(text);
          if (!contacts.length) {
            await showMain(ctx, "No valid numbers found. Cancelled.");
            break;
          }
          const r = await api(base, "POST", "/whatsapp/campaign/start", {
            contacts,
            message: state.data.message,
          });
          if (r.ok === false) {
            await showMain(ctx, "❌ " + esc(r.message || "Couldn't start campaign."));
            break;
          }
          await ctx.reply(`📣 Starting for ${contacts.length} numbers…`);
          runWaBoard(ctx, base).catch((e) => logger.error({ err: e }, "wa board"));
          break;
        }

        case "tg_scrape_source": {
          state.data.source = text;
          state.flow = "tg_scrape_target";
          await ctx.reply(
            "Now send the TARGET group(s) to add members INTO. For multiple, put each on a new line:",
            { reply_markup: cancelKeyboard() },
          );
          break;
        }

        case "tg_scrape_target": {
          flows.delete(chatId);
          if (!base) {
            await promptBackend(ctx);
            break;
          }
          const source = state.data.source as string;
          const targets = text
            .split(/[\n,]+/)
            .map((t) => t.trim())
            .filter(Boolean);
          if (!targets.length) {
            await showMain(ctx, "No target group given. Cancelled.");
            break;
          }
          const r = await api(base, "POST", "/scrape/add-members", {
            sourceGroups: [source],
            targetGroups: targets,
            limit: 5000,
            safeMode: false,
          });
          if (r.ok === false) {
            await showMain(ctx, "❌ " + esc(r.message || "Couldn't start the job."));
            break;
          }
          runAddBoard(ctx, base).catch((e) => logger.error({ err: e }, "add board"));
          break;
        }

        case "tg_login_phone": {
          if (!base) {
            flows.delete(chatId);
            await promptBackend(ctx);
            break;
          }
          await ctx.reply("⏳ Sending login code to Telegram…");
          const r = await api(base, "POST", "/login/start", {
            phone: text,
            createNew: true,
            label: "Bot-linked",
          });
          if (!r.ok) {
            flows.delete(chatId);
            await showMain(
              ctx,
              "❌ " + esc(r.message || "Couldn't start login. Check the API keys on your backend."),
            );
            break;
          }
          state.data.accountId = r.accountId;
          state.flow = "tg_login_code";
          await ctx.reply(
            "📲 Telegram sent a login code (inside the Telegram app). Send that code here:",
            { reply_markup: cancelKeyboard() },
          );
          break;
        }

        case "tg_login_code": {
          if (!base) {
            flows.delete(chatId);
            await promptBackend(ctx);
            break;
          }
          await api(base, "POST", "/login/code", { code: text, accountId: state.data.accountId });
          await ctx.reply("⏳ Verifying…");
          const ls = await pollLogin(base, state.data.accountId);
          if (ls === "connected") {
            flows.delete(chatId);
            await showMain(ctx, "✅ Your Telegram account is linked!");
          } else if (ls === "awaiting_password") {
            state.flow = "tg_login_2fa";
            await ctx.reply("🔐 This account has 2FA. Send your Telegram password:", {
              reply_markup: cancelKeyboard(),
            });
          } else {
            flows.delete(chatId);
            await showMain(ctx, "❌ Login failed or timed out. Try again from ✈️ Telegram.");
          }
          break;
        }

        case "tg_login_2fa": {
          if (!base) {
            flows.delete(chatId);
            await promptBackend(ctx);
            break;
          }
          await api(base, "POST", "/login/2fa", {
            password: text,
            accountId: state.data.accountId,
          });
          await ctx.reply("⏳ Verifying password…");
          const ls = await pollLogin(base, state.data.accountId);
          flows.delete(chatId);
          if (ls === "connected") await showMain(ctx, "✅ Your Telegram account is linked!");
          else await showMain(ctx, "❌ Wrong password or timed out. Try again from ✈️ Telegram.");
          break;
        }

        case "gmail_subject": {
          state.data.subject = text;
          state.flow = "gmail_body";
          await ctx.reply("Send the email BODY (plain text or HTML):", {
            reply_markup: cancelKeyboard(),
          });
          break;
        }

        case "gmail_body": {
          state.data.body = text;
          state.flow = "gmail_recipients";
          await ctx.reply("Send the recipient emails (spaces, commas or new lines):", {
            reply_markup: cancelKeyboard(),
          });
          break;
        }

        case "gmail_recipients": {
          flows.delete(chatId);
          if (!base) {
            await promptBackend(ctx);
            break;
          }
          const recipients = parseEmails(text);
          if (!recipients.length) {
            await showMain(ctx, "No valid emails found. Cancelled.");
            break;
          }
          const r = await api(base, "POST", "/gmail/campaign/start", {
            contacts: recipients,
            subject: state.data.subject,
            html: state.data.body,
          });
          if (r.ok === false) {
            await showMain(ctx, "❌ " + esc(r.message || "Couldn't start the email campaign."));
            break;
          }
          await showMain(
            ctx,
            `✉️ Gmail campaign started for ${recipients.length} recipients. Check 📊 Status.`,
          );
          break;
        }
      }
    } catch (e: any) {
      flows.delete(chatId);
      await showMain(ctx, "⚠️ " + (e?.message || String(e)));
    }
  });

  bot.catch((err) => {
    logger.error({ err: err.error }, "Control bot error");
  });

  bot.api
    .setMyCommands([
      { command: "menu", description: "Open the control menu" },
      { command: "redeem", description: "Enter an access code" },
      { command: "help", description: "How to use the bot" },
      { command: "cancel", description: "Cancel the current step" },
    ])
    .catch(() => {});

  bot
    .start({
      onStart: (info) => logger.info({ username: info.username }, "Control bot started"),
    })
    .catch((err) => logger.error({ err }, "Control bot failed to start"));
}
