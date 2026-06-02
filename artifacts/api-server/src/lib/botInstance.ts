// ─── MFG Telegram Bot Engine ─────────────────────────────────────────────────
import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/index.js";
import { NewMessage } from "telegram/events/index.js";
import fs from "fs";
import path from "path";
import { execFile } from "child_process";

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

function readJSON(file: string, def: any) {
  try {
    const p = path.join(DATA_DIR, file);
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {}
  return def;
}
function writeJSON(file: string, data: any) {
  try { fs.writeFileSync(path.join(DATA_DIR, file), JSON.stringify(data, null, 2)); } catch {}
}

const SETTINGS_DEFAULTS = {
  aiEnabled: false, aiMode: "chill", aiDelay: 0, aiTyping: false,
  aiDisclaimer: true, disclaimerText: "👋 hey — quick heads up: you're speaking to teddymfg's MIRROR AI 🤖 he's offline rn but i'll text you for him in his style.",
  transcribeVoice: true, visionEnabled: true, antiScam: true, moodAware: true,
  birthdayWishes: true, autoTakeover: true, takeoverMinutes: 10,
  smmMarkup: 20, smmNGNRate: 1600, prefix: ".", botName: "mfg_tgbot",
  owners: [] as string[],
  smsProvider: "textbelt", smsApiKey: "", smsSenderId: "MFGBot",
  systemPrompt: `You are texting AS the owner of this phone — you ARE them. Not a bot, not an assistant. Just them.

IDENTITY: Nigerian. Real one. You mix English and pidgin naturally without forcing it.

YOUR ONLY JOB: Mirror how the owner texts. Copy their exact sentence length, punctuation style, capitalisation, emoji usage, slang, and energy level.

NEVER: Never say "as an AI", "I'm a bot", "certainly", "of course", "I'd be happy to". Never be preachy. Never insult anyone.

BILLING DODGE: If someone asks for money, gently dodge with humor in pidgin.

ESCALATION: If someone is genuinely distressed or suicidal — start reply with [STOP] and nothing else.

WHEN UNSURE: Be short, lowercase, casual. One word answers are fine.`
};

const CAMPAIGN_RATE = 25;

const VARIATION_CHARS = ["\u200b", "\u200c", "\u200d", "\u2060", "\ufeff"];
function addVariation(msg: string): string {
  const ch = VARIATION_CHARS[Math.floor(Math.random() * VARIATION_CHARS.length)];
  return msg + ch;
}
const SCAM_PATTERNS = [
  /invest(ment)?\s*(opportunity|platform|scheme)/i,
  /double your (money|investment|bitcoin)/i,
  /send me (your|the) (otp|pin|password|code)/i,
  /(ponzi|pyramid|mlm|network marketing)/i,
  /(free money|earn \$\d+|make \$\d+ per day)/i,
  /wire transfer|western union|money gram/i,
  /click (this|the) link to (claim|receive|get)/i
];

class TelegramBotEngine {
  private tgClient: TelegramClient | null = null;
  private tgMe: any = null;
  private isConnected = false;
  private startTime = Date.now();
  private messageCount = 0;
  private settings: any;
  private styleSamples: any[];
  private userData: any;
  private convHistory: any;
  private savedNotes: any;
  private savedTodos: any;
  private savedKV: any;
  private autoReplies: any;
  private walletData: any;
  private scamAlerts: any[];
  private answerSessions = new Map<string, number>();
  private aiPaused = new Map<string, number>();
  private ownerTakeover = new Map<string, number>();
  private aiContactDisabled = new Set<string>();
  private disclaimerSent = new Map<string, string>();
  private activePersona = new Map<string, string>();
  private rateLimitMap = new Map<string, any>();
  private pending: { phoneCode: ((v: string) => void) | null; password: ((v: string) => void) | null } = { phoneCode: null, password: null };
  private campaign: any = { active: false, contacts: [], index: 0, message: "", sent: 0, failed: 0, noTelegram: 0, skipped: 0, startTime: null, timer: null, onUpdate: null, delayMs: 2400, log: [], batchCount: 0, floodWait: 0, options: {} };
  private blacklist = new Set<string>();

  constructor() {
    this.settings = { ...SETTINGS_DEFAULTS, ...readJSON("settings.json", {}) };
    this.styleSamples = readJSON("style_samples.json", []);
    this.userData = readJSON("users.json", {});
    this.convHistory = readJSON("conv_history.json", {});
    this.savedNotes = readJSON("notes.json", {});
    this.savedTodos = readJSON("todos.json", {});
    this.savedKV = readJSON("kv.json", {});
    this.autoReplies = readJSON("autoreplies.json", {});
    this.walletData = readJSON("wallets.json", {});
    this.scamAlerts = readJSON("scam_alerts.json", []);
    writeJSON("settings.json", this.settings);
    this.init();
  }

  getTgCreds(): { apiId: number; apiHash: string } {
    const saved = readJSON("tg_credentials.json", {});
    const apiId = parseInt(String(saved.apiId || process.env.TG_API_ID || "0"));
    const apiHash = String(saved.apiHash || process.env.TG_API_HASH || "");
    return { apiId, apiHash };
  }

  hasTgCreds(): boolean {
    const { apiId, apiHash } = this.getTgCreds();
    return !!apiId && !!apiHash;
  }

  setTgCreds(apiId: number | string, apiHash: string) {
    const id = parseInt(String(apiId));
    if (!id || !apiHash) throw new Error("apiId and apiHash required");
    writeJSON("tg_credentials.json", { apiId: id, apiHash });
  }

  private async init() {
    const { apiId, apiHash } = this.getTgCreds();
    if (!apiId || !apiHash) {
      console.log("[Bot] ⚠️  TG_API_ID and TG_API_HASH not set. Dashboard available.");
      return;
    }
    const saved = readJSON("tg_session.json", { session: "" });
    const session = new StringSession(saved.session || "");
    this.tgClient = new TelegramClient(session, apiId, apiHash, { connectionRetries: 5, useWSS: true });
    try {
      await this.tgClient.start({
        phoneNumber: async () => process.env.OWNER_PHONE || "",
        phoneCode: async () => {
          console.log("[Bot] ⏳ Waiting for phone code...");
          return new Promise<string>((resolve) => { this.pending.phoneCode = resolve; });
        },
        password: async () => {
          console.log("[Bot] 🔐 2FA required...");
          return new Promise<string>((resolve) => { this.pending.password = resolve; });
        },
        onError: (err: any) => console.log("[Bot] Login error:", err.message)
      });
      const sessionStr = this.tgClient.session.save() as unknown as string;
      writeJSON("tg_session.json", { session: sessionStr });
      this.tgMe = await this.tgClient.getMe();
      this.isConnected = true;
      console.log(`[Bot] ✅ Connected as @${this.tgMe.username || this.tgMe.firstName}`);
      this.registerHandler();
    } catch (err: any) {
      console.log("[Bot] ❌ Connection failed:", err.message);
      this.tgClient = null;
      this.isConnected = false;
    }
  }

  async startLogin(phone: string) {
    const { apiId, apiHash } = this.getTgCreds();
    if (!apiId || !apiHash) throw new Error("Telegram API ID and API Hash required — save them in Settings first");
    const session = new StringSession("");
    this.tgClient = new TelegramClient(session, apiId, apiHash, { connectionRetries: 3 });
    this.tgClient.start({
      phoneNumber: async () => phone,
      phoneCode: async () => new Promise<string>((resolve) => { this.pending.phoneCode = resolve; }),
      password: async () => new Promise<string>((resolve) => { this.pending.password = resolve; }),
      onError: (err: any) => console.log("[Bot] Login error:", err.message)
    }).then(async () => {
      const sessionStr = this.tgClient!.session.save() as unknown as string;
      writeJSON("tg_session.json", { session: sessionStr });
      this.tgMe = await this.tgClient!.getMe();
      this.isConnected = true;
      console.log(`[Bot] ✅ Logged in as @${this.tgMe.username}`);
      this.registerHandler();
    }).catch((err: any) => {
      console.log("[Bot] Login failed:", err.message);
    });
  }

  submitCode(code: string) {
    if (!this.pending.phoneCode) throw new Error("No pending phone code request");
    this.pending.phoneCode(code);
    this.pending.phoneCode = null;
  }

  submit2FA(password: string) {
    if (!this.pending.password) throw new Error("No pending 2FA request");
    this.pending.password(password);
    this.pending.password = null;
  }

  async disconnect() {
    if (this.tgClient) {
      try { await this.tgClient.disconnect(); } catch {}
      this.tgClient = null;
      this.isConnected = false;
      this.tgMe = null;
    }
  }

  // Scrape members of a Telegram group/channel using the logged-in session.
  async scrapeGroup(link: string, limit = 5000): Promise<{ username: string | null; phone: string | null; name: string; id: string }[]> {
    if (!this.isConnected || !this.tgClient) throw new Error("Not connected to Telegram — log in first");
    if (!link || !link.trim()) throw new Error("Group link or username required");

    // Normalise input: accept https://t.me/xxx, t.me/xxx, @xxx, or xxx
    let target = link.trim();
    target = target.replace(/^https?:\/\//i, "").replace(/^t\.me\//i, "").replace(/^@/, "");
    target = target.replace(/\/+$/, "");
    // Join links like joinchat/HASH or +HASH are invite links — not resolvable for scraping
    if (/^(joinchat\/|\+)/i.test(target)) {
      throw new Error("Private invite links can't be scraped. Use the group's public @username, or join the group and use its link.");
    }

    let entity: any;
    try {
      entity = await this.tgClient.getEntity(target);
    } catch (e: any) {
      throw new Error(`Could not find that group: ${e?.errorMessage || e?.message || "unknown error"}`);
    }

    let participants: any[] = [];
    try {
      participants = await this.tgClient.getParticipants(entity, { limit }) as any[];
    } catch (e: any) {
      const msg = e?.errorMessage || e?.message || "";
      if (msg.includes("CHAT_ADMIN_REQUIRED") || msg.includes("ADMIN")) {
        throw new Error("This group hides its members — admin rights are required to list them.");
      }
      throw new Error(`Could not pull members: ${msg || "unknown error"}`);
    }

    const members = participants
      .filter((u: any) => u && !u.bot && !u.deleted)
      .map((u: any) => ({
        username: u.username || null,
        phone: u.phone ? (u.phone.startsWith("+") ? u.phone : "+" + u.phone) : null,
        name: [u.firstName, u.lastName].filter(Boolean).join(" ") || u.username || "Member",
        id: u.id?.toString() || "",
      }));
    return members;
  }

  getStatus() {
    const cs = this.getCampaignStatus();
    return {
      connected: this.isConnected,
      me: this.tgMe ? { username: this.tgMe.username, phone: this.tgMe.phone, name: this.tgMe.firstName } : null,
      uptime: Math.floor((Date.now() - this.startTime) / 1000),
      messages: this.messageCount,
      aiEnabled: this.settings.aiEnabled,
      hasGroqKey: !!process.env.GROQ_API_KEY,
      hasSmmKey: !!(process.env.SMM_API_KEY || this.settings.smmApiKey),
      hasSmsKey: !!(this.settings.smsApiKey || process.env.SMS_API_KEY || process.env.TWILIO_ACCOUNT_SID || process.env.TERMII_API_KEY),
      hasTgCreds: this.hasTgCreds(),
      campaign: cs,
      smsCampaign: null
    };
  }

  getCampaignStatus() {
    if (!this.campaign.active && !this.campaign.log?.length) return { active: false };
    const total = this.campaign.contacts.length;
    const done = this.campaign.sent + this.campaign.failed + this.campaign.noTelegram;
    const opts = this.campaign.options || {};
    const avgDelay = ((opts.minDelay || 3) + (opts.maxDelay || 8)) / 2;
    return {
      active: this.campaign.active,
      total,
      sent: this.campaign.sent,
      failed: this.campaign.failed,
      noTelegram: this.campaign.noTelegram,
      skipped: this.campaign.skipped || 0,
      elapsed: this.campaign.startTime ? Math.round((Date.now() - this.campaign.startTime) / 60000) : 0,
      remain: total > done ? Math.ceil((total - done) * avgDelay / 60) : 0,
      percent: total > 0 ? Math.round(done / total * 100) : 0,
      floodWait: this.campaign.floodWait || 0,
      log: (this.campaign.log || []).slice(-200)
    };
  }

  stopCampaign() {
    if (!this.campaign.active) return;
    clearTimeout(this.campaign.timer);
    this.campaign.active = false;
    this._saveHistory();
  }

  private _saveHistory() {
    if (!this.campaign.startTime || !this.campaign.contacts.length) return;
    try {
      const histDir = path.join(DATA_DIR, "campaign-history");
      if (!fs.existsSync(histDir)) fs.mkdirSync(histDir, { recursive: true });
      const id = this.campaign.startTime.toString();
      fs.writeFileSync(
        path.join(histDir, `${id}.json`),
        JSON.stringify({
          id,
          startTime: this.campaign.startTime,
          endTime: Date.now(),
          total: this.campaign.contacts.length,
          sent: this.campaign.sent,
          failed: this.campaign.failed,
          noTelegram: this.campaign.noTelegram,
          skipped: this.campaign.skipped || 0,
          message: (this.campaign.message || "").slice(0, 120),
          log: this.campaign.log || []
        }, null, 2)
      );
    } catch {}
  }

  async startCampaignFromAPI(contacts: any[], message: string, options: any = {}) {
    if (!this.isConnected || !this.tgClient) throw new Error("Not connected to Telegram");
    if (this.campaign.active) throw new Error("A campaign is already running");
    if (!contacts.length) throw new Error("No contacts");
    const opts = {
      minDelay: options.minDelay ?? 3,
      maxDelay: options.maxDelay ?? 8,
      batchSize: options.batchSize ?? 20,
      batchPauseMin: options.batchPauseMin ?? 5,
      typingDelay: options.typingDelay ?? false,
      autoVariation: options.autoVariation ?? true,
      dailyLimit: options.dailyLimit ?? 0,
    };
    const bl: string[] = readJSON("blacklist.json", []);
    this.blacklist = new Set(bl.map((p: string) => p.replace(/\s/g, "")));
    this.campaign = {
      active: true, contacts, index: 0, message, sent: 0, failed: 0, noTelegram: 0, skipped: 0,
      startTime: Date.now(), timer: null,
      onUpdate: (t: string) => console.log("[Campaign]", t),
      delayMs: opts.minDelay * 1000,
      log: [], batchCount: 0, floodWait: 0, options: opts,
      dailySent: 0
    };
    this._campaignNext();
  }

  private _campaignNext() {
    if (!this.campaign.active) return;
    const { contacts, index, message, onUpdate, options } = this.campaign;
    if (index >= contacts.length) {
      this.campaign.active = false;
      this._saveHistory();
      onUpdate?.(`✅ Complete! Sent: ${this.campaign.sent}, No TG: ${this.campaign.noTelegram}, Failed: ${this.campaign.failed}`);
      return;
    }
    if (options.dailyLimit > 0 && this.campaign.dailySent >= options.dailyLimit) {
      this.campaign.active = false;
      this._saveHistory();
      onUpdate?.(`⏹ Daily limit reached (${options.dailyLimit})`);
      return;
    }
    const { phone, name } = contacts[index];
    this.campaign.index++;

    // Skip blacklisted numbers
    const normPhone = phone.replace(/\s/g, "");
    if (this.blacklist.has(normPhone) || this.blacklist.has(phone)) {
      this.campaign.skipped++;
      this.campaign.log.push({ phone, name, status: "skipped", at: Date.now(), error: "blacklisted" });
      this.campaign.timer = setTimeout(() => this._campaignNext(), 50);
      return;
    }

    let personalised = message.replace(/\{name\}/gi, name || "").replace(/\{phone\}/gi, phone);
    if (options.autoVariation) personalised = addVariation(personalised);

    (async () => {
      const minMs = (options.minDelay || 3) * 1000;
      const maxMs = (options.maxDelay || 8) * 1000;
      const randomDelay = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
      const logEntry: any = { phone, name, status: "pending", at: Date.now() };
      this.campaign.log.push(logEntry);
      if (this.campaign.log.length > 500) this.campaign.log = this.campaign.log.slice(-500);

      try {
        const { Api } = await import("telegram");
        let user: any = null;
        if (phone.trim().startsWith("@")) {
          // Username contact (e.g. scraped from a group where phone is hidden) — resolve directly.
          const uname = phone.trim().replace(/^@/, "");
          try {
            user = await this.tgClient!.getEntity(uname);
          } catch {
            user = null;
          }
        } else {
          const cleanPhone = phone.replace(/\D/g, "").replace(/^0+/, "");
          const normalised = cleanPhone.startsWith("+") ? cleanPhone : "+" + cleanPhone;
          const imported: any = await this.tgClient!.invoke(
            new Api.contacts.ImportContacts({
              contacts: [new Api.InputPhoneContact({
                clientId: BigInt(index),
                phone: normalised,
                firstName: name || "User",
                lastName: "",
              })],
            })
          );
          user = imported?.users?.[0];
        }
        if (user) {
          if (options.typingDelay) {
            try {
              await this.tgClient!.invoke(new Api.messages.SetTyping({ peer: user, action: new Api.SendMessageTypingAction() }));
              await new Promise(r => setTimeout(r, Math.floor(Math.random() * 2000) + 1000));
            } catch {}
          }
          await this.tgClient!.sendMessage(user, { message: personalised });
          this.campaign.sent++;
          this.campaign.dailySent++;
          logEntry.status = "sent";
          logEntry.at = Date.now();
        } else {
          this.campaign.noTelegram++;
          logEntry.status = "no_telegram";
          logEntry.at = Date.now();
        }
      } catch (e: any) {
        const errMsg = e?.errorMessage || e?.message || "";
        if (errMsg.includes("FLOOD_WAIT") || e?.seconds) {
          const waitSec = e.seconds || 60;
          console.log(`[Campaign] Flood wait ${waitSec}s — pausing`);
          this.campaign.floodWait = waitSec;
          this.campaign.index--;
          logEntry.status = "flood_wait";
          logEntry.error = `Flood wait ${waitSec}s`;
          this.campaign.log.pop();
          this.campaign.timer = setTimeout(() => {
            this.campaign.floodWait = 0;
            this._campaignNext();
          }, waitSec * 1000 + 2000);
          return;
        }
        this.campaign.failed++;
        logEntry.status = "error";
        logEntry.error = errMsg.slice(0, 80);
        logEntry.at = Date.now();
        console.log(`[Campaign] Error → ${phone}: ${errMsg}`);
      }

      this.campaign.batchCount++;
      if (options.batchSize > 0 && this.campaign.batchCount >= options.batchSize) {
        this.campaign.batchCount = 0;
        const pauseMs = (options.batchPauseMin || 5) * 60 * 1000;
        console.log(`[Campaign] Batch pause ${options.batchPauseMin}min`);
        this.campaign.timer = setTimeout(() => this._campaignNext(), pauseMs);
      } else {
        this.campaign.timer = setTimeout(() => this._campaignNext(), randomDelay);
      }
    })();
  }

  getSettings() {
    return { ...this.settings };
  }

  updateSettings(updates: any) {
    const sensitive = ["smmApiKey", "smsApiKey"];
    for (const [k, v] of Object.entries(updates)) {
      if (sensitive.includes(k) && !v) continue;
      this.settings[k] = v;
    }
    writeJSON("settings.json", this.settings);
  }

  getWallet(id: string) {
    if (!this.walletData[id]) this.walletData[id] = { userId: id, balance: 0, currency: "NGN", topups: [], spends: [] };
    return { ...this.walletData[id], userId: id };
  }

  walletCredit(id: string, amt: number, note: string) {
    const w = this.getWallet(id);
    w.balance += amt;
    w.topups.push({ amount: amt, note, at: Date.now() });
    if (w.topups.length > 30) w.topups = w.topups.slice(-30);
    this.walletData[id] = w;
    writeJSON("wallets.json", this.walletData);
  }

  walletDebit(id: string, amt: number, note: string): boolean {
    const w = this.getWallet(id);
    if (w.balance < amt) return false;
    w.balance -= amt;
    w.spends.push({ amount: amt, note, at: Date.now() });
    if (w.spends.length > 50) w.spends = w.spends.slice(-50);
    this.walletData[id] = w;
    writeJSON("wallets.json", this.walletData);
    return true;
  }

  getScamAlerts() {
    return this.scamAlerts.slice(0, 50);
  }

  private isOwner(senderId: string) {
    if (!this.tgMe) return false;
    return senderId === this.tgMe.id?.toString() || (this.settings.owners || []).includes(senderId);
  }

  private moodPrompt() {
    if (!this.settings.moodAware) return "";
    const h = new Date().getHours();
    if (h >= 6 && h < 11) return "\n\n[MOOD: morning — sharp, direct, fresh energy. short replies.]";
    if (h >= 11 && h < 17) return "\n\n[MOOD: afternoon — normal energy, balanced.]";
    if (h >= 17 && h < 23) return "\n\n[MOOD: evening — chill, more emojis ok, slightly playful.]";
    return "\n\n[MOOD: late night — sleepy energy, minimal words.]";
  }

  private checkRateLimit(id: string): boolean {
    const now = Date.now();
    const e = this.rateLimitMap.get(id) || { count: 0, windowStart: now };
    if (now - e.windowStart > 60000) { e.count = 1; e.windowStart = now; this.rateLimitMap.set(id, e); return true; }
    e.count++; this.rateLimitMap.set(id, e);
    return e.count <= 15;
  }

  private async askGroq(prompt: string, chatId: string | null, opts: any = {}): Promise<string | null> {
    const key = process.env.GROQ_API_KEY;
    if (!key) return null;
    try {
      const history = opts.history || (chatId ? (this.convHistory[chatId] || []).slice(-6) : []);
      const resp = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}` },
        body: JSON.stringify({
          model: opts.model || "llama-3.3-70b-versatile",
          messages: [
            { role: "system", content: opts.system || "You are a helpful AI assistant. Be accurate and clear." },
            ...history,
            { role: "user", content: prompt }
          ],
          max_tokens: opts.maxTokens || 600,
          temperature: opts.temp || 0.7
        }),
        signal: AbortSignal.timeout(25000)
      });
      const data: any = await resp.json();
      return data.choices?.[0]?.message?.content?.trim() || null;
    } catch { return null; }
  }

  private async mirrorAI(text: string, chatId: string): Promise<string | null> {
    const key = process.env.GROQ_API_KEY;
    if (!key) return null;
    const persona = this.activePersona.get(chatId);
    const sys = persona
      ? `You are roleplaying as ${persona}. Respond exactly how ${persona} would.`
      : this.settings.systemPrompt + this.moodPrompt();
    try {
      const history = (this.convHistory[chatId] || []).slice(-8);
      const resp = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}` },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile",
          messages: [{ role: "system", content: sys }, ...history, { role: "user", content: text }],
          max_tokens: 250, temperature: 0.85
        }),
        signal: AbortSignal.timeout(25000)
      });
      const data: any = await resp.json();
      const reply = data.choices?.[0]?.message?.content?.trim();
      if (reply && chatId) {
        if (!this.convHistory[chatId]) this.convHistory[chatId] = [];
        this.convHistory[chatId].push({ role: "user", content: text });
        this.convHistory[chatId].push({ role: "assistant", content: reply });
        if (this.convHistory[chatId].length > 20) this.convHistory[chatId] = this.convHistory[chatId].slice(-20);
        setImmediate(() => writeJSON("conv_history.json", this.convHistory));
      }
      return reply;
    } catch { return null; }
  }

  private async transcribeAudio(buffer: Buffer, mimetype: string): Promise<string | null> {
    const key = process.env.GROQ_API_KEY;
    if (!key || !buffer || buffer.length < 100) return null;
    try {
      const ext = mimetype?.includes("mp4") ? "m4a" : mimetype?.includes("mpeg") ? "mp3" : "ogg";
      const ct = mimetype?.includes("mp4") ? "audio/mp4" : mimetype?.includes("mpeg") ? "audio/mpeg" : "audio/ogg";
      const blob = new Blob([buffer], { type: ct });
      const form = new FormData();
      form.append("file", blob, "audio." + ext);
      form.append("model", "whisper-large-v3");
      form.append("response_format", "json");
      form.append("language", "en");
      form.append("prompt", "Nigerian English with pidgin.");
      form.append("temperature", "0");
      const resp = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
        method: "POST",
        headers: { "Authorization": `Bearer ${key}` },
        body: form as any,
        signal: AbortSignal.timeout(30000)
      });
      const data: any = await resp.json();
      if (!resp.ok) return null;
      return data.text?.trim() || null;
    } catch { return null; }
  }

  private parseVCF(vcfText: string) {
    const contacts: any[] = [];
    for (const card of vcfText.split(/END:VCARD/i)) {
      const nameM = card.match(/FN:(.*)/i);
      const phoneM = card.match(/TEL[^:]*:([\d+\s\-().]+)/i);
      if (phoneM) {
        let phone = phoneM[1].replace(/\s/g, "").replace(/[^\d+]/g, "");
        if (!phone.startsWith("+")) phone = "+" + phone;
        if (phone.length >= 7) contacts.push({ phone, name: nameM ? nameM[1].trim() : phone });
      }
    }
    return contacts;
  }

  private registerHandler() {
    if (!this.tgClient) return;
    this.tgClient.addEventHandler((event: any) => this.handleMessage(event), new NewMessage({}));
    console.log("[Bot] Message handler registered.");
  }

  private async handleMessage(event: any) {
    try {
      const msg = event.message;
      const isFromMe = msg.out;
      const chat = await event.getChat().catch(() => null);
      // getSender() doesn't exist on all event types — use msg.sender or fromId
      const sender = msg.sender || (msg.fromId ? { id: msg.fromId } : null);
      const chatId = chat?.id?.toString();
      const senderId = sender?.id?.toString();
      const text = msg.text || msg.message || "";
      const isPrivate = chat?.className === "User";
      const senderIsOwner = isFromMe || this.isOwner(senderId);
      const pfx = this.settings.prefix;
      this.messageCount++;
      const send = async (t: string) => {
        try { await event.reply({ message: t, parseMode: "markdown" }); }
        catch { try { await event.reply(t); } catch {} }
      };

      if (isFromMe && this.settings.autoTakeover && chatId) this.ownerTakeover.set(chatId, Date.now());

      let transcribedText = "";
      if (!isFromMe && this.settings.transcribeVoice && msg.voice) {
        try {
          const buf = await this.tgClient!.downloadMedia(msg, { outputFile: Buffer.alloc(0) });
          if (buf && buf.length > 100) transcribedText = await this.transcribeAudio(buf as Buffer, "audio/ogg") || "";
        } catch {}
      }

      const effectiveText = text || transcribedText || (msg.voice ? "[sent a voice note]" : msg.photo ? "[sent a photo]" : msg.document ? "[sent a file]" : "");
      const lowerText = effectiveText.toLowerCase();

      if (!isFromMe && effectiveText && SCAM_PATTERNS.some(p => p.test(effectiveText))) {
        const alert = { chatId, text: effectiveText.slice(0, 200), at: Date.now() };
        this.scamAlerts.unshift(alert);
        if (this.scamAlerts.length > 50) this.scamAlerts.length = 50;
        writeJSON("scam_alerts.json", this.scamAlerts);
      }

      const billingTriggers = ["send me money","pay me","when you go pay","you owe me","my money","loan me","borrow me","refund","pay back","send alert","credit me","send cash","transfer"];
      if (!isFromMe && effectiveText && !effectiveText.startsWith(pfx) && billingTriggers.some(k => lowerText.includes(k))) {
        const dodges = ["omo my phone no dey charge properly 😂 wetin you talk?","guy the network just cut off now now — you say wetin?","abeg e no concern me for this time of the day 💀","who send you? 😂 carry go","i go send am when i wake up i dey sleep now 🥱","e don dey your account check am again nah","which money 🤨 explain yourself","billing me? after everything i do for you?? 💀","omo wait make i check my account 👀 ...yeah nothing 😭","i dey process am trust me 🙏"];
        await send(dodges[Math.floor(Math.random() * dodges.length)]);
        return;
      }

      for (const [trigger, response] of Object.entries(this.autoReplies)) {
        if (!isFromMe && effectiveText && !effectiveText.startsWith(pfx) && lowerText.includes(trigger.toLowerCase())) {
          await send(response as string);
          return;
        }
      }

      if (!isFromMe && effectiveText && !effectiveText.startsWith(pfx) && isPrivate && this.answerSessions.has(chatId)) {
        const ts = this.answerSessions.get(chatId)!;
        if (Date.now() - ts < 5 * 60 * 1000) {
          this.answerSessions.set(chatId, Date.now());
          const reply = await this.askGroq(effectiveText, chatId, { system: "You are a helpful AI assistant on Telegram." });
          if (reply) await send(reply);
          return;
        } else this.answerSessions.delete(chatId);
      }

      if (effectiveText.startsWith(pfx)) {
        if (!senderIsOwner && !this.checkRateLimit(senderId)) return;
        const [rawCmd, ...args] = effectiveText.slice(pfx.length).trim().split(/\s+/);
        const cmd = rawCmd.toLowerCase();

        if (cmd === "campaign" || cmd === "blast" || cmd === "bulk") {
          if (!senderIsOwner) { await send("❌ Owner only."); return; }
          const sub = (args[0] || "").toLowerCase();
          if (sub === "stop") { this.stopCampaign(); await send("⏹ Campaign stopped."); return; }
          if (sub === "status") {
            const cs = this.getCampaignStatus() as any;
            if (!cs?.active) { await send("ℹ️ No campaign running."); return; }
            await send(`📊 *Campaign Progress*\n\n✔️ Sent: ${cs.sent}/${cs.total} (${cs.percent}%)\n❌ Failed: ${cs.failed}`);
            return;
          }
          if (msg.document) {
            try {
              const buf = await this.tgClient!.downloadMedia(msg, { outputFile: Buffer.alloc(0) });
              const vcfText = (buf as Buffer).toString("utf8");
              const contacts = this.parseVCF(vcfText);
              if (!contacts.length) { await send("❌ No valid contacts in that VCF."); return; }
              const campaignMsg = msg.message?.split("\n").slice(1).join("\n").trim() || "Hey {name}!";
              await this.startCampaignFromAPI(contacts, campaignMsg);
            } catch (e: any) { await send("❌ Could not read VCF: " + e.message); }
            return;
          }
          await send(`📱 *Telegram Campaign*\n\nSend a .vcf contacts file with your message as caption.\n\n📊 Rate: ${CAMPAIGN_RATE} msgs/min\n.campaign stop | status`);
          return;
        }

        if (cmd === "sms" || cmd === "smscampaign" || cmd === "smsblast") {
          if (!senderIsOwner) { await send("❌ Owner only."); return; }
          await send(`📱 *SMS Campaign*\n\nUse the web dashboard to start an SMS campaign.\n\n*Features:*\n• Bulk SMS to thousands\n• VCF/CSV contact import\n• Multiple providers (Twilio, Termii, Textbelt, Africa's Talking)\n• {name} and {phone} personalisation\n• Delivery status tracking\n\n🌐 Visit the dashboard for full SMS control.`);
          return;
        }

        if (cmd === "ai" || cmd === "mirror") {
          if (!senderIsOwner) {
            const question = args.join(" ").trim();
            if (!question) { await send("💬 *.ai <question>* — ask me anything."); return; }
            const reply = await this.askGroq(question, chatId);
            if (reply) { this.answerSessions.set(chatId, Date.now()); await send(`🤖 ${reply}\n\n_Reply to continue_`); }
            else await send("❌ AI unavailable."); return;
          }
          const sub = (args[0] || "").toLowerCase();
          if (sub === "on") { this.settings.aiEnabled = true; writeJSON("settings.json", this.settings); await send("🤖 Mirror AI *ON*"); return; }
          if (sub === "off") { this.settings.aiEnabled = false; writeJSON("settings.json", this.settings); await send("🔴 Mirror AI *OFF*"); return; }
          if (sub === "prompt") {
            const p = args.slice(1).join(" ");
            if (!p) { await send(`Current prompt:\n\n${this.settings.systemPrompt.slice(0, 300)}...`); return; }
            this.settings.systemPrompt = p; writeJSON("settings.json", this.settings); await send("✅ Prompt updated."); return;
          }
          await send(`🤖 Mirror AI: ${this.settings.aiEnabled ? "🟢 ON" : "🔴 OFF"}\n.ai on/off | .ai prompt <text>`);
          return;
        }

        if (cmd === "persona") {
          const name = args.join(" ").trim();
          if (!name) { await send("🎭 .persona <name> — roleplay as anyone\n.persona off — back to normal"); return; }
          if (name.toLowerCase() === "off") { this.activePersona.delete(chatId); await send("🎭 Persona off."); return; }
          this.activePersona.set(chatId, name);
          await send(`🎭 Persona: *${name}* activated.`); return;
        }

        if (cmd === "answer") {
          const question = args.join(" ").trim();
          if (!question) { await send(".answer <question>"); return; }
          const reply = await this.askGroq(question, chatId);
          if (reply) { this.answerSessions.set(chatId, Date.now()); await send(`🤖 ${reply}\n\n_Reply to continue_`); }
          else await send("❌ AI unavailable."); return;
        }

        if (cmd === "lyrics") {
          const vibe = args.join(" ") || "Afrobeats love song";
          await send("🎵 Writing lyrics...");
          const reply = await this.askGroq(`Write original Afrobeats/Afropop song lyrics about: "${vibe}". Include verse, chorus, bridge. Nigerian/pidgin style. Fire.`, chatId, { maxTokens: 600 });
          await send(reply || "❌ Failed."); return;
        }

        if (cmd === "freestyle") {
          const topic = args.join(" ") || "life";
          await send("🎤 Spitting bars...");
          const reply = await this.askGroq(`Freestyle rap about: "${topic}". Nigerian trap/afrobeats style. 8-12 lines. Use flow and real bars.`, chatId, { maxTokens: 300 });
          await send(reply || "❌ Failed."); return;
        }

        if (cmd === "shade") {
          const target = args.join(" ") || "nobody";
          await send("🌚 Crafting shade...");
          const reply = await this.askGroq(`Write subtle shade about: "${target}". Nigerian social media style — clever, indirect, plausibly deniable. 3-5 lines.`, chatId, { maxTokens: 200 });
          await send(reply || "❌ Failed."); return;
        }

        if (cmd === "capcheck") {
          const claim = args.join(" ");
          if (!claim) { await send(".capcheck <claim>"); return; }
          const reply = await this.askGroq(`Is this cap or facts: "${claim}". Give verdict: CAP 🧢 or FACTS ✅. Brief explanation. Nigerian internet slang.`, chatId, { maxTokens: 150 });
          await send(reply || "❌ Failed."); return;
        }

        if (cmd === "naija") {
          const topic = args.join(" ");
          if (!topic) { await send(".naija <topic> — explain in Nigerian pidgin"); return; }
          const reply = await this.askGroq(`Explain this in Nigerian Pidgin English: "${topic}". Sound like a real Naija person explaining to their friend.`, chatId, { maxTokens: 300 });
          await send(reply || "❌ Failed."); return;
        }

        if (cmd === "roast") {
          const target = args.join(" ") || "myself";
          await send("🔥 Heating up...");
          const reply = await this.askGroq(`Write a hilarious but friendly roast about: "${target}". Nigerian internet style. Max 5 punchy lines.`, chatId, { maxTokens: 300 });
          await send(reply || "❌ Failed."); return;
        }

        if (cmd === "translate") {
          const parts = args.join(" ").split(" to ");
          const textToTranslate = parts[0]?.trim();
          const lang = parts[1]?.trim() || "English";
          if (!textToTranslate) { await send(".translate <text> to <language>"); return; }
          const reply = await this.askGroq(`Translate to ${lang}: "${textToTranslate}". Just the translation.`, chatId, { maxTokens: 300 });
          await send(reply || "❌ Failed."); return;
        }

        if (cmd === "caption") {
          const topic = args.join(" ") || "a fire photo";
          const reply = await this.askGroq(`Write 3 fire Telegram/Instagram captions for: "${topic}". Nigerian Gen-Z style.`, chatId, { maxTokens: 300 });
          await send(reply || "❌ Failed."); return;
        }

        if (cmd === "joke") { const jokes = ["Why don't scientists trust atoms? Because they make up everything 😂", "Wetin be the difference between a Naija bus driver and a student? The student take the bus to school, the driver take am to heaven 💀", "I asked God for a bike but I know He doesn't work that way — so I stole a bike and asked for forgiveness. Abeg 🙏😂"]; await send(jokes[Math.floor(Math.random() * jokes.length)]); return; }
        if (cmd === "fact") { const f = await this.askGroq("Give one surprising, little-known fact in 2 sentences max.", null, { maxTokens: 100 }); await send("🧠 " + (f || "The shortest war in history lasted 38-45 minutes — the Anglo-Zanzibar War of 1896.")); return; }
        if (cmd === "quote") { const q = await this.askGroq("Give one powerful inspiring quote. Format: 'Quote' — Author", null, { maxTokens: 80 }); await send("💭 " + (q || '"The harder you work the luckier you get." — Samuel Goldwyn')); return; }
        if (cmd === "8ball") { const answers = ["✅ Yes definitely", "✅ Without a doubt", "🔮 Ask again later", "🌫 Cannot predict now", "❌ Don't count on it", "❌ Very doubtful"]; await send(`🎱 "${args.join(" ")}"\n\n${answers[Math.floor(Math.random() * answers.length)]}`); return; }
        if (cmd === "coin") { await send(Math.random() > 0.5 ? "🪙 Heads!" : "🪙 Tails!"); return; }
        if (cmd === "dice") { const sides = parseInt(args[0]) || 6; await send(`🎲 Rolled a ${Math.floor(Math.random() * sides) + 1} (d${sides})`); return; }
        if (cmd === "slot") { const s = ["🍒","🍋","🍊","💎","7️⃣","🔔"]; const r = [s[Math.floor(Math.random()*s.length)], s[Math.floor(Math.random()*s.length)], s[Math.floor(Math.random()*s.length)]]; await send(`🎰 ${r.join(" | ")}\n${r[0]===r[1]&&r[1]===r[2]?"JACKPOT 🎉":r[0]===r[1]||r[1]===r[2]||r[0]===r[2]?"Match! 🏆":"No match 💀"}`); return; }
        if (cmd === "rps") { const choices = ["rock","paper","scissors"]; const u = (args[0]||"").toLowerCase(); const bot = choices[Math.floor(Math.random()*3)]; if (!choices.includes(u)) { await send("Pick: rock, paper, or scissors"); return; } const win = (u==="rock"&&bot==="scissors")||(u==="paper"&&bot==="rock")||(u==="scissors"&&bot==="paper"); await send(`You: ${u}\nMe: ${bot}\n${u===bot?"Tie 🤝":win?"You win 🏆":"I win 😤"}`); return; }
        if (cmd === "ship") { const names = args.join(" ").split(/\s+and\s+|\s*\+\s*|\s*&\s*/i); const n1=names[0]?.trim()||"you"; const n2=names[1]?.trim()||"them"; const pct=Math.floor(Math.random()*101); await send(`💘 ${n1} + ${n2}\n${pct}% compatible\n${pct>80?"Soulmates fr 🔥":pct>60?"Solid connection 💯":pct>40?"Could work 🤔":"Yikes 💀"}`); return; }
        if (cmd === "rate") { const thing = args.join(" ") || "that"; await send(`${thing}: ${Math.floor(Math.random()*101)}/100`); return; }
        if (cmd === "choose") { const opts = args.join(" ").split(/\s*[\|\/,]\s*/).map(s=>s.trim()).filter(Boolean); await send(opts.length>=2?`I pick: *${opts[Math.floor(Math.random()*opts.length)]}* 🎯`:"Give options: .choose a | b | c"); return; }
        if (cmd === "rizz") { const pct=Math.floor(Math.random()*101); await send(`Rizz level: ${pct}/100\n${pct>80?"🔥 God-tier":pct>60?"💪 Decent":pct>40?"😐 Mid":pct>20?"😬 Low":"💀 No rizz bro"}`); return; }
        if (cmd === "sus") { await send(`${args.join(" ")||"you"} is ${Math.floor(Math.random()*101)}% sus 🔴`); return; }
        if (cmd === "hype") { const h=["LET'S GOOOOO 🔥🔥🔥","W BEHAVIOR FR 💯","NO CAP THAT'S DIFFERENT 🏆","GOATED WITH THE SAUCE 🐐"]; await send(h[Math.floor(Math.random()*h.length)]); return; }
        if (cmd === "lucky") { await send(`🍀 Your lucky number today: ${Math.floor(Math.random()*100)+1}`); return; }

        if (cmd === "time") { await send(`🕐 ${new Date().toLocaleTimeString("en-US",{hour12:true,timeZone:"Africa/Lagos"})} (WAT)`); return; }
        if (cmd === "date") { await send(`📅 ${new Date().toLocaleDateString("en-US",{weekday:"long",year:"numeric",month:"long",day:"numeric",timeZone:"Africa/Lagos"})}`); return; }
        if (cmd === "uptime") { const u=Math.floor((Date.now()-this.startTime)/1000); await send(`⏱ Uptime: ${Math.floor(u/3600)}h ${Math.floor((u%3600)/60)}m ${u%60}s`); return; }
        if (cmd === "calc") { const expr=args.join(" "); try { const result=Function('"use strict";return('+expr+')')(); await send(`🧮 ${expr} = *${result}*`); } catch { await send("❌ Invalid expression"); } return; }
        if (cmd === "password") { const len=parseInt(args[0])||16; const chars="abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%"; await send(`🔐 \`${Array.from({length:len},()=>chars[Math.floor(Math.random()*chars.length)]).join("")}\``); return; }
        if (cmd === "uuid") { const uuid=`xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx`.replace(/[xy]/g,c=>{const r=Math.random()*16|0;return(c==="x"?r:(r&0x3|0x8)).toString(16);}); await send(`🔑 \`${uuid}\``); return; }
        if (cmd === "bmi") { const w=parseFloat(args[0]); const h=parseFloat(args[1]); if(!w||!h){await send(".bmi <weight_kg> <height_cm>"); return;} const bmi=(w/((h/100)**2)).toFixed(1); await send(`⚖️ BMI: ${bmi} — ${parseFloat(bmi)<18.5?"Underweight":parseFloat(bmi)<25?"Normal ✅":parseFloat(bmi)<30?"Overweight":"Obese"}`); return; }
        if (cmd === "nairarate") {
          await send("⏳ Fetching rates...");
          try {
            const r = await fetch("https://api.frankfurter.app/latest?from=USD&to=NGN", { signal: AbortSignal.timeout(8000) });
            const d: any = await r.json();
            await send(`💱 *Forex*\n\n$1 USD ≈ ₦${d.rates?.NGN?.toFixed(0) || "N/A"}\n_Market rate_`);
          } catch { await send("❌ Couldn't fetch rates."); }
          return;
        }
        if (cmd === "weather") {
          const city = args.join(" ");
          if (!city) { await send(".weather <city>"); return; }
          try {
            const r = await fetch(`https://wttr.in/${encodeURIComponent(city)}?format=3`, { signal: AbortSignal.timeout(8000) });
            const d = await r.text();
            await send("🌦 " + d);
          } catch { await send("❌ Couldn't fetch weather."); }
          return;
        }

        if (cmd === "note") { const content=args.join(" "); if(!content){await send(".note <text> | .notes | .delnote <#>"); return;} if(!this.savedNotes[chatId])this.savedNotes[chatId]=[]; this.savedNotes[chatId].push({id:Date.now(),text:content,time:new Date().toLocaleString()}); writeJSON("notes.json",this.savedNotes); await send(`📝 Note saved (#${this.savedNotes[chatId].length})`); return; }
        if (cmd === "notes") { const ns=this.savedNotes[chatId]||[]; await send(ns.length?`📝 Notes (${ns.length}):\n\n${ns.map((n:any,i:number)=>`${i+1}. ${n.text}`).join("\n")}`:"No notes. Use .note <text>"); return; }
        if (cmd === "delnote") { const idx=(parseInt(args[0])||1)-1; const ns=this.savedNotes[chatId]||[]; if(ns[idx]){ns.splice(idx,1);writeJSON("notes.json",this.savedNotes);await send("Note deleted.");}else await send("Note not found."); return; }
        if (cmd === "todo") { const content=args.join(" "); if(!content){await send(".todo <task> | .todos | .done <#>"); return;} if(!this.savedTodos[chatId])this.savedTodos[chatId]=[]; this.savedTodos[chatId].push({text:content,done:false}); writeJSON("todos.json",this.savedTodos); await send(`✅ Todo added (#${this.savedTodos[chatId].length})`); return; }
        if (cmd === "todos") { const ts=this.savedTodos[chatId]||[]; await send(ts.length?`📋 Todos:\n\n${ts.map((t:any,i:number)=>`${t.done?"✅":"⬜"} ${i+1}. ${t.text}`).join("\n")}`:"No todos."); return; }
        if (cmd === "done") { const idx=(parseInt(args[0])||1)-1; const ts=this.savedTodos[chatId]||[]; if(ts[idx]){ts[idx].done=true;writeJSON("todos.json",this.savedTodos);await send(`✅ Done: ${ts[idx].text}`);}else await send("Todo not found."); return; }

        if (cmd === "status" || cmd === "ping") {
          const u = Math.floor((Date.now()-this.startTime)/1000);
          await send(`📱 *MFG Bot Status*\n\nConnection: ${this.isConnected?"🟢 Connected":"🔴 Disconnected"}\nUptime: ${Math.floor(u/3600)}h ${Math.floor((u%3600)/60)}m\nMessages: ${this.messageCount}\nAI: ${this.settings.aiEnabled?"🟢 ON":"🔴 OFF"}`);
          return;
        }

        if (cmd === "settings" || cmd === "config") {
          if (!senderIsOwner) { await send("❌ Owner only."); return; }
          const sub = (args[0]||"").toLowerCase();
          if (sub === "ai") { this.settings.aiEnabled=args[1]==="on"; writeJSON("settings.json",this.settings); await send(`AI Mirror: ${this.settings.aiEnabled?"🟢 ON":"🔴 OFF"}`); return; }
          if (sub === "antiscam") { this.settings.antiScam=args[1]==="on"; writeJSON("settings.json",this.settings); await send(`Anti-scam: ${this.settings.antiScam?"🟢 ON":"🔴 OFF"}`); return; }
          if (sub === "prefix") { const p=args[1]; if(p&&p.length===1){this.settings.prefix=p;writeJSON("settings.json",this.settings);await send(`Prefix: ${p}`);}else await send(`.settings prefix <char>`); return; }
          await send(`⚙️ *Settings*\n\nAI: ${this.settings.aiEnabled?"🟢 ON":"🔴 OFF"}\nPrefix: ${this.settings.prefix}\nAnti-scam: ${this.settings.antiScam?"🟢":"🔴"}\n\n.settings ai on/off\n.settings prefix <char>\n.settings antiscam on/off`);
          return;
        }

        if (cmd === "menu" || cmd === "help") {
          await send(`🤖 *MFG Bot*\n\n*AI*\n.ai on/off — mirror AI\n.answer <q> — ask anything\n.persona <name> — roleplay\n.lyrics <vibe> — song lyrics\n.freestyle <topic> — rap bars\n.translate <text> to <lang>\n.roast <target>\n.shade <target>\n\n*FUN*\n.joke .fact .quote .8ball\n.rps .ship .rate .choose\n.coin .dice .slot .rizz .hype\n\n*UTILITY*\n.calc .weather .nairarate\n.time .date .uptime .bmi\n.note .notes .todo .todos\n.password .uuid\n\n*CAMPAIGN*\n.campaign — bulk TG DMs\n.sms — bulk SMS\n\n*OWNER*\n.settings .status`);
          return;
        }

        if (this.settings.aiEnabled && process.env.GROQ_API_KEY) {
          const reply = await this.mirrorAI(effectiveText, chatId);
          if (reply) await send(reply);
        } else {
          await send(`Unknown command. Type ${pfx}menu for all commands.`);
        }
        return;
      }

      if (!isFromMe && isPrivate && this.settings.aiEnabled && !this.aiPaused.has(chatId) && !this.aiContactDisabled.has(chatId)) {
        if (this.settings.autoTakeover && this.ownerTakeover.has(chatId)) {
          const pauseUntil = this.ownerTakeover.get(chatId)! + (this.settings.takeoverMinutes * 60 * 1000);
          if (Date.now() < pauseUntil) return;
          else this.ownerTakeover.delete(chatId);
        }
        if (!effectiveText) return;
        if (this.settings.aiDisclaimer) {
          const today = new Date().toDateString();
          if (this.disclaimerSent.get(chatId) !== today) {
            this.disclaimerSent.set(chatId, today);
            try { await send(this.settings.disclaimerText); } catch {}
          }
        }
        const reply = await this.mirrorAI(effectiveText, chatId);
        if (reply) {
          if (reply.startsWith("[STOP]")) { this.aiPaused.set(chatId, Date.now()); return; }
          if (this.settings.aiDelay > 0) await new Promise(r => setTimeout(r, this.settings.aiDelay * 1000));
          await send(reply);
        }
      }
    } catch (err: any) {
      console.log("[Bot] Handler error:", err.message);
    }
  }
}

let botInstance: TelegramBotEngine | null = null;

export function getBotInstance(): TelegramBotEngine {
  if (!botInstance) botInstance = new TelegramBotEngine();
  return botInstance;
}
