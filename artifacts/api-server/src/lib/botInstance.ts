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

// ── Multi-account store ───────────────────────────────────────────────────────
// Each user/account links its own Telegram (own api_id/api_hash + phone session),
// or relies on the global admin creds (tg_credentials.json). One account is
// "active" (connected) at a time; switching disconnects and reconnects.
const ACCOUNTS_FILE = "tg_accounts.json";

export type TgAccount = {
  id: string;
  label: string;
  apiId?: number;
  apiHash?: string;
  session: string;
  username?: string | null;
  phone?: string | null;
  name?: string | null;
};
type TgAccountsStore = { accounts: TgAccount[]; activeId: string | null };

function readAccountsStore(): TgAccountsStore {
  const store = readJSON(ACCOUNTS_FILE, null);
  if (store && Array.isArray(store.accounts)) {
    return { accounts: store.accounts, activeId: store.activeId ?? null };
  }
  return { accounts: [], activeId: null };
}
function writeAccountsStore(store: TgAccountsStore) {
  writeJSON(ACCOUNTS_FILE, store);
}
function genAccountId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
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
  private activeAccountId: string | null = null;
  private pendingLoginAccountId: string | null = null;
  private loginState: "idle" | "awaiting_code" | "awaiting_password" | "connected" | "error" = "idle";
  private loginError: string | null = null;
  private initPromise: Promise<void> | null = null;
  private switching = false;
  private handlerClient: TelegramClient | null = null;
  private campaign: any = { active: false, contacts: [], index: 0, message: "", sent: 0, failed: 0, noTelegram: 0, skipped: 0, startTime: null, timer: null, onUpdate: null, delayMs: 2400, log: [], batchCount: 0, floodWait: 0, options: {} };
  private addJob: any = { active: false, total: 0, added: 0, failed: 0, privacy: 0, index: 0, members: [], targetEntity: null, timer: null, log: [], floodWait: 0, startTime: null, scrapePhase: false, currentSource: null, sourcesTotal: 0, sourcesDone: 0 };
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
    this._migrateAccounts();
    this.initPromise = this.init();
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

  // ── Account store / lifecycle ───────────────────────────────────────────────
  // On first boot, fold any legacy single-account session into one account record.
  private _migrateAccounts() {
    const store = readAccountsStore();
    if (store.accounts.length > 0) {
      this.activeAccountId = store.activeId || store.accounts[0].id;
      return;
    }
    const legacy = readJSON("tg_session.json", { session: "" });
    if (legacy?.session) {
      const acc: TgAccount = {
        id: genAccountId(), label: "Account 1", session: legacy.session,
        username: null, phone: null, name: null,
      };
      writeAccountsStore({ accounts: [acc], activeId: acc.id });
      this.activeAccountId = acc.id;
    }
  }

  private _getAccount(id: string | null): TgAccount | null {
    if (!id) return null;
    return readAccountsStore().accounts.find(a => a.id === id) || null;
  }

  private _saveAccount(acc: TgAccount) {
    const store = readAccountsStore();
    const idx = store.accounts.findIndex(a => a.id === acc.id);
    if (idx >= 0) store.accounts[idx] = acc; else store.accounts.push(acc);
    writeAccountsStore(store);
  }

  // Per-account creds, falling back to the global admin keys.
  private getCredsForAccount(acc: TgAccount | null): { apiId: number; apiHash: string } {
    if (acc?.apiId && acc?.apiHash) return { apiId: Number(acc.apiId), apiHash: String(acc.apiHash) };
    return this.getTgCreds();
  }

  getAccounts() {
    const store = readAccountsStore();
    return {
      activeId: this.activeAccountId,
      accounts: store.accounts.map(a => ({
        id: a.id,
        label: a.label,
        username: a.username || null,
        phone: a.phone || null,
        name: a.name || null,
        hasOwnCreds: !!(a.apiId && a.apiHash),
        hasSession: !!a.session,
        active: this.activeAccountId === a.id,
        connected: this.isConnected && this.activeAccountId === a.id,
      })),
    };
  }

  createAccount(label: string, apiId?: number | string, apiHash?: string): TgAccount {
    const store = readAccountsStore();
    const acc: TgAccount = {
      id: genAccountId(),
      label: (label || "").trim() || `Account ${store.accounts.length + 1}`,
      session: "", username: null, phone: null, name: null,
    };
    if (apiId && apiHash) { acc.apiId = parseInt(String(apiId)); acc.apiHash = String(apiHash); }
    store.accounts.push(acc);
    if (!store.activeId) { store.activeId = acc.id; this.activeAccountId = acc.id; }
    writeAccountsStore(store);
    return acc;
  }

  updateAccount(id: string, patch: { label?: string; apiId?: number | string; apiHash?: string }): TgAccount {
    const acc = this._getAccount(id);
    if (!acc) throw new Error("Account not found");
    if (patch.label !== undefined && String(patch.label).trim()) acc.label = String(patch.label).trim();
    if (patch.apiId && patch.apiHash) { acc.apiId = parseInt(String(patch.apiId)); acc.apiHash = String(patch.apiHash); }
    this._saveAccount(acc);
    return acc;
  }

  async removeAccount(id: string) {
    await this._ready();
    if (this.pendingLoginAccountId === id) throw new Error("Finish or cancel the login in progress first");
    if ((this.campaign.active || this.addJob.active) && this.activeAccountId === id) {
      throw new Error("Stop the running campaign/add job before removing the active account");
    }
    const store = readAccountsStore();
    if (!store.accounts.some(a => a.id === id)) throw new Error("Account not found");
    const wasActive = this.activeAccountId === id;
    store.accounts = store.accounts.filter(a => a.id !== id);
    if (wasActive) {
      await this.disconnect();
      this.activeAccountId = store.accounts[0]?.id || null;
      store.activeId = this.activeAccountId;
    }
    writeAccountsStore(store);
    if (wasActive && this.activeAccountId) {
      const next = this._getAccount(this.activeAccountId);
      if (next?.session) { try { await this.connectAccount(next); } catch {} }
    }
  }

  async setActiveAccount(id: string) {
    await this._ready();
    if (this.pendingLoginAccountId) throw new Error("Finish the login in progress before switching accounts");
    if (this.campaign.active || this.addJob.active) throw new Error("Stop the running campaign/add job before switching accounts");
    if (this.switching) throw new Error("Already switching accounts — try again in a moment");
    const acc = this._getAccount(id);
    if (!acc) throw new Error("Account not found");
    if (this.activeAccountId === id && this.isConnected) return;
    this.switching = true;
    try {
      await this.disconnect();
      const store = readAccountsStore();
      store.activeId = id;
      writeAccountsStore(store);
      this.activeAccountId = id;
      if (acc.session) await this.connectAccount(acc);
    } finally {
      this.switching = false;
    }
  }

  // Non-interactive connect using a saved session (never prompts for a code).
  private async connectAccount(acc: TgAccount): Promise<void> {
    const { apiId, apiHash } = this.getCredsForAccount(acc);
    if (!apiId || !apiHash) throw new Error("No Telegram API credentials for this account");
    if (!acc.session) throw new Error("This account isn't logged in yet");
    const session = new StringSession(acc.session);
    const client = new TelegramClient(session, apiId, apiHash, { connectionRetries: 5, useWSS: true });
    await client.connect();
    const me: any = await client.getMe();
    if (!me) throw new Error("Session invalid — please log in again");
    this.tgClient = client;
    this.tgMe = me;
    this.isConnected = true;
    acc.username = me.username || null;
    acc.phone = me.phone || null;
    acc.name = me.firstName || null;
    acc.session = client.session.save() as unknown as string;
    this._saveAccount(acc);
    this.registerHandler();
  }

  private async init() {
    const acc = this._getAccount(this.activeAccountId);
    if (!acc) {
      console.log("[Bot] No Telegram account linked yet. Dashboard available.");
      return;
    }
    if (!acc.session) {
      console.log(`[Bot] Account "${acc.label}" has no session yet — awaiting login.`);
      return;
    }
    try {
      await this.connectAccount(acc);
      console.log(`[Bot] ✅ Connected as @${this.tgMe?.username || this.tgMe?.firstName}`);
    } catch (err: any) {
      console.log("[Bot] ❌ Connection failed:", err.message);
      this.tgClient = null; this.isConnected = false; this.tgMe = null;
    }
  }

  // Wait for the initial (constructor-triggered) connect to settle before any
  // lifecycle operation, so requests don't race the startup reconnect.
  private async _ready(): Promise<void> {
    if (this.initPromise) { try { await this.initPromise; } catch {} }
  }

  async startLogin(phone: string, opts: { accountId?: string; createNew?: boolean; label?: string; apiId?: number | string; apiHash?: string } = {}) {
    await this._ready();
    if (this.campaign.active || this.addJob.active) throw new Error("Stop the running campaign/add job before logging in");
    if (this.pendingLoginAccountId) throw new Error("A login is already in progress");

    // Resolve which account this login targets — existing, explicitly-new, or
    // (legacy) the active one. The "Add account" flow always passes createNew so
    // a bare phone login can never overwrite an existing account's session.
    let acc: TgAccount | null;
    if (opts.accountId) {
      acc = this._getAccount(opts.accountId);
      if (!acc) throw new Error("Account not found");
      if (opts.apiId && opts.apiHash) { acc.apiId = parseInt(String(opts.apiId)); acc.apiHash = String(opts.apiHash); this._saveAccount(acc); }
    } else if (opts.createNew || opts.label || (opts.apiId && opts.apiHash)) {
      acc = this.createAccount(opts.label || "", opts.apiId, opts.apiHash);
    } else {
      acc = this._getAccount(this.activeAccountId) || this.createAccount("Account 1", opts.apiId, opts.apiHash);
    }

    const { apiId, apiHash } = this.getCredsForAccount(acc);
    if (!apiId || !apiHash) throw new Error("Telegram API ID and API Hash required — add them for this account or set global keys in Settings");

    // This login owns the connection — drop any currently-connected client first.
    await this.disconnect();
    this.pendingLoginAccountId = acc.id;
    this.activeAccountId = acc.id;
    this.loginState = "awaiting_code";
    this.loginError = null;
    const store = readAccountsStore();
    store.activeId = acc.id;
    writeAccountsStore(store);

    const session = new StringSession("");
    const client = new TelegramClient(session, apiId, apiHash, { connectionRetries: 3 });
    this.tgClient = client;
    const accId = acc.id;
    client.start({
      phoneNumber: async () => phone,
      phoneCode: async () => new Promise<string>((resolve) => { this.pending.phoneCode = resolve; }),
      password: async () => new Promise<string>((resolve) => { this.loginState = "awaiting_password"; this.pending.password = resolve; }),
      onError: (err: any) => console.log("[Bot] Login error:", err.message)
    }).then(async () => {
      const sessionStr = client.session.save() as unknown as string;
      const me: any = await client.getMe();
      const saved = this._getAccount(accId);
      if (saved) {
        saved.session = sessionStr;
        saved.username = me?.username || null;
        saved.phone = me?.phone || null;
        saved.name = me?.firstName || null;
        this._saveAccount(saved);
      }
      this.tgMe = me;
      this.isConnected = true;
      this.pendingLoginAccountId = null;
      this.loginState = "connected";
      console.log(`[Bot] ✅ Logged in as @${this.tgMe?.username}`);
      this.registerHandler();
    }).catch((err: any) => {
      console.log("[Bot] Login failed:", err.message);
      this.pending.phoneCode = null;
      this.pending.password = null;
      this.pendingLoginAccountId = null;
      this.loginState = "error";
      this.loginError = err?.message || "Login failed";
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
    await this._ready();
    if (this.tgClient) {
      try { await this.tgClient.disconnect(); } catch {}
    }
    this.tgClient = null;
    this.isConnected = false;
    this.tgMe = null;
    this.handlerClient = null;
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

  // ── Add-Members engine ──────────────────────────────────────────────────────

  private _normalizeGroupLink(link: string): string {
    return link.trim()
      .replace(/^https?:\/\//i, "").replace(/^t\.me\//i, "").replace(/^@/, "").replace(/\/+$/, "");
  }

  // Multi-source: scrape several source groups sequentially, deduplicate, then add all to target.
  async startMultiSourceAddJob(
    targetGroup: string,
    sourceGroups: string[],
    limit: number,
    preloadedMembers?: Array<{ username: string | null; phone: string | null; name: string; id: string }>
  ) {
    if (!this.isConnected || !this.tgClient) throw new Error("Not connected to Telegram — log in first");
    if (this.addJob.active) throw new Error("An add job is already running — stop it first");

    const normalizedTarget = this._normalizeGroupLink(targetGroup);
    if (/^(joinchat\/|\+)/i.test(normalizedTarget)) {
      throw new Error("Private invite links not supported. Use the group's public @username.");
    }

    let targetEntity: any;
    try {
      targetEntity = await this.tgClient.getEntity(normalizedTarget);
    } catch (e: any) {
      throw new Error(`Could not find target group/channel: ${e?.errorMessage || e?.message || "unknown"}`);
    }

    // Initialise job in scrape phase
    this.addJob = {
      active: true, total: 0, added: 0, failed: 0, privacy: 0, index: 0,
      members: [], targetEntity, timer: null, log: [], floodWait: 0, startTime: Date.now(),
      scrapePhase: sourceGroups.length > 0, currentSource: sourceGroups[0] || null,
      sourcesTotal: sourceGroups.length, sourcesDone: 0,
      noCooldown: false, peerFloodStop: false, fatalStop: false,
    };

    // Scrape each source group sequentially, then kick off the add loop
    (async () => {
      const seen = new Set<string>();
      const allMembers: Array<{ username: string | null; phone: string | null; name: string; id: string }> = [];

      const dedupAdd = (m: { username: string | null; phone: string | null; name: string; id: string }) => {
        const key = m.username ? `u:${m.username.toLowerCase()}` : m.id ? `i:${m.id}` : null;
        if (!key || seen.has(key)) return;
        seen.add(key);
        allMembers.push(m);
      };

      // Include any already-scraped members passed in (e.g. from the manual scrape flow)
      if (preloadedMembers?.length) {
        for (const m of preloadedMembers) dedupAdd(m);
      }

      for (let si = 0; si < sourceGroups.length; si++) {
        if (!this.addJob.active) break; // stopped by user
        const src = sourceGroups[si];
        this.addJob.currentSource = src;
        this.addJob.sourcesDone = si;
        this.addJob.log.push({ status: "scraping", msg: `🔍 Scraping ${src} (${si + 1}/${sourceGroups.length})…`, at: Date.now() });

        try {
          const scraped = await this.scrapeGroup(src, limit);
          for (const m of scraped) dedupAdd(m);
          this.addJob.log.push({ status: "scraped", msg: `✅ ${src} — ${scraped.length} found, ${allMembers.length} unique so far`, at: Date.now() });
        } catch (e: any) {
          this.addJob.log.push({ status: "failed", msg: `❌ Failed to scrape ${src}: ${e.message}`, at: Date.now() });
        }
        this.addJob.sourcesDone = si + 1;
      }

      if (!this.addJob.active) return; // stopped mid-scrape

      if (!allMembers.length) {
        this.addJob.active = false;
        this.addJob.scrapePhase = false;
        this.addJob.log.push({ status: "done", msg: "⚠️ No members found across all source groups.", at: Date.now() });
        return;
      }

      // Transition to add phase
      this.addJob.scrapePhase = false;
      this.addJob.currentSource = null;
      this.addJob.members = allMembers;
      this.addJob.total = allMembers.length;
      this.addJob.log.push({ status: "info", msg: `🚀 Starting add job for ${allMembers.length} unique members…`, at: Date.now() });
      this._addNext();
    })();
  }

  async startAddJob(targetGroup: string, members: Array<{ username: string | null; phone: string | null; name: string; id: string }>, options: { noCooldown?: boolean } = {}) {
    if (!this.isConnected || !this.tgClient) throw new Error("Not connected to Telegram — log in first");
    if (this.addJob.active) throw new Error("An add job is already running — stop it first");
    if (!members.length) throw new Error("No members provided");

    const normalized = this._normalizeGroupLink(targetGroup);
    if (/^(joinchat\/|\+)/i.test(normalized)) {
      throw new Error("Private invite links not supported. Use the group's public @username.");
    }

    let targetEntity: any;
    try {
      targetEntity = await this.tgClient.getEntity(normalized);
    } catch (e: any) {
      throw new Error(`Could not find target group/channel: ${e?.errorMessage || e?.message || "unknown"}`);
    }

    this.addJob = {
      active: true, total: members.length, added: 0, failed: 0, privacy: 0, index: 0,
      members, targetEntity, timer: null, log: [], floodWait: 0, startTime: Date.now(),
      noCooldown: options.noCooldown !== false, peerFloodStop: false, fatalStop: false,
      scrapePhase: false, currentSource: null, sourcesTotal: 0, sourcesDone: 0,
    };
    this._addNext();
  }

  private _addNext() {
    if (!this.addJob.active) return;
    const { members, index, targetEntity } = this.addJob;

    if (index >= members.length) {
      this.addJob.active = false;
      this.addJob.log.push({ status: "done", msg: `✅ Finished. Added: ${this.addJob.added}, Privacy restricted: ${this.addJob.privacy}, Failed: ${this.addJob.failed}`, at: Date.now() });
      return;
    }

    const member = members[index];
    this.addJob.index++;

    (async () => {
      const logEntry: any = { name: member.name, username: member.username, id: member.id, status: "pending", at: Date.now() };
      this.addJob.log.push(logEntry);
      if (this.addJob.log.length > 300) this.addJob.log = this.addJob.log.slice(-300);

      try {
        const { Api } = await import("telegram");

        // Resolve user entity: try username → numeric id → phone (ImportContacts)
        let userEntity: any = null;

        if (member.username || member.id) {
          const identifier: any = member.username ? member.username : BigInt(member.id!);
          try {
            userEntity = await this.tgClient!.getEntity(identifier);
          } catch { /* fall through to phone */ }
        }

        if (!userEntity && member.phone) {
          // Phone fallback: import as contact temporarily to get the TG user entity
          try {
            const result: any = await this.tgClient!.invoke(new Api.contacts.ImportContacts({
              contacts: [new (Api.InputPhoneContact as any)({
                clientId: BigInt(Math.floor(Math.random() * 1000000000)) as any,
                phone: member.phone.replace(/[^\d+]/g, ""),
                firstName: member.name || member.phone,
                lastName: "",
              })],
            }));
            userEntity = result.users?.[0] || null;
          } catch { /* ignore — phone may not be registered on TG */ }
        }

        if (!userEntity) {
          logEntry.status = "skipped";
          logEntry.error = "Cannot resolve user — no username, ID, or registered phone";
          logEntry.at = Date.now();
          this.addJob.failed++;
          this.addJob.timer = setTimeout(() => this._addNext(), this.addJob.noCooldown ? 0 : 500);
          return;
        }

        const isChannel = targetEntity.className === "Channel";
        if (isChannel) {
          await this.tgClient!.invoke(new Api.channels.InviteToChannel({
            channel: targetEntity,
            users: [userEntity],
          }));
        } else {
          await this.tgClient!.invoke(new Api.messages.AddChatUser({
            chatId: targetEntity.id,
            userId: userEntity,
            fwdLimit: 50,
          }));
        }

        logEntry.status = "added";
        logEntry.at = Date.now();
        this.addJob.added++;
      } catch (e: any) {
        const msg = e?.errorMessage || e?.message || "";
        if (msg.includes("FLOOD_WAIT") || e?.seconds) {
          const waitSec = e.seconds || 60;
          console.log(`[AddJob] Flood wait ${waitSec}s`);
          this.addJob.floodWait = waitSec;
          this.addJob.index--;
          logEntry.status = "flood_wait";
          logEntry.error = `Flood wait ${waitSec}s`;
          logEntry.at = Date.now();
          this.addJob.log.pop();
          this.addJob.timer = setTimeout(() => {
            this.addJob.floodWait = 0;
            this._addNext();
          }, waitSec * 1000 + 2000);
          return;
        }
        if (msg.includes("USER_PRIVACY_RESTRICTED") || msg.includes("PRIVACY_RESTRICTED")) {
          logEntry.status = "privacy";
          logEntry.error = "Privacy restricted";
          this.addJob.privacy++;
        } else if (msg.includes("USER_ALREADY_PARTICIPANT") || msg.includes("ALREADY_PARTICIPANT")) {
          logEntry.status = "already";
          logEntry.error = "Already a member";
          this.addJob.added++;
        } else if (msg.includes("PEER_FLOOD")) {
          logEntry.status = "failed";
          logEntry.error = "PEER_FLOOD — account limited";
          this.addJob.failed++;
          this.addJob.peerFloodStop = true;
        } else if (
          msg.includes("CHAT_WRITE_FORBIDDEN") ||
          msg.includes("CHAT_ADMIN_REQUIRED") ||
          msg.includes("CHAT_ADMINS_REQUIRED") ||
          msg.includes("CHANNEL_PRIVATE") ||
          msg.includes("USER_NOT_PARTICIPANT")
        ) {
          // Target-level permission problem: it affects every member, so don't
          // burn through the whole list — stop the job and explain why.
          logEntry.status = "failed";
          logEntry.error = "No permission to add to this group";
          this.addJob.failed++;
          this.addJob.fatalStop = true;
        } else if (msg.includes("USER_BOT")) {
          logEntry.status = "skipped";
          logEntry.error = "User is a bot";
          this.addJob.failed++;
        } else {
          logEntry.status = "failed";
          logEntry.error = msg.slice(0, 80);
          this.addJob.failed++;
        }
        logEntry.at = Date.now();
      }

      // Stop immediately if the account can't add to this target at all — the
      // error affects every member, so there's no point retrying the whole list.
      if (this.addJob.fatalStop) {
        this.addJob.active = false;
        this.addJob.log.push({ status: "stopped", msg: `⛔ Stopped: this account can't add members to the target group/channel. The connected Telegram account must be a member AND an admin there with "Add members" permission. (Telegram may also temporarily block adding if the account was recently rate-limited.) Added: ${this.addJob.added}.`, at: Date.now() });
        return;
      }
      // Stop immediately if Telegram flagged the account (PEER_FLOOD) — hammering risks a ban.
      if (this.addJob.peerFloodStop) {
        this.addJob.active = false;
        this.addJob.log.push({ status: "stopped", msg: `⛔ Stopped: Telegram limited this account (PEER_FLOOD). Added: ${this.addJob.added}. Wait a while or switch to another account.`, at: Date.now() });
        return;
      }
      // Turbo mode: no artificial countdown (tiny ~130–250ms floor only). FLOOD_WAIT still pauses.
      const delay = this.addJob.noCooldown
        ? Math.floor(Math.random() * 120) + 130
        : Math.floor(Math.random() * 3000) + 2000;
      this.addJob.timer = setTimeout(() => this._addNext(), delay);
    })();
  }

  getAddStatus() {
    const j = this.addJob;
    if (!j.active && !j.log?.length) return { active: false };
    return {
      active: j.active,
      total: j.total,
      added: j.added,
      failed: j.failed,
      privacy: j.privacy,
      index: j.index,
      percent: j.total > 0 ? Math.round(j.index / j.total * 100) : 0,
      floodWait: j.floodWait || 0,
      noCooldown: !!j.noCooldown,
      elapsed: j.startTime ? Math.round((Date.now() - j.startTime) / 1000) : 0,
      log: (j.log || []).slice(-100),
      scrapePhase: j.scrapePhase || false,
      currentSource: j.currentSource || null,
      sourcesTotal: j.sourcesTotal || 0,
      sourcesDone: j.sourcesDone || 0,
    };
  }

  stopAddJob() {
    if (!this.addJob.active) return;
    clearTimeout(this.addJob.timer);
    this.addJob.active = false;
    this.addJob.log.push({ status: "stopped", msg: `⏹ Stopped. Added: ${this.addJob.added}`, at: Date.now() });
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
      activeAccountId: this.activeAccountId,
      loginState: this.loginState,
      loginError: this.loginError,
      pendingLogin: !!this.pendingLoginAccountId,
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
    const noCooldown = !!options.noCooldown;
    const opts = {
      minDelay: noCooldown ? 0 : (options.minDelay ?? 3),
      maxDelay: noCooldown ? 0 : (options.maxDelay ?? 8),
      batchSize: noCooldown ? 0 : (options.batchSize ?? 20),
      batchPauseMin: noCooldown ? 0 : (options.batchPauseMin ?? 5),
      typingDelay: noCooldown ? false : (options.typingDelay ?? false),
      autoVariation: options.autoVariation ?? true,
      dailyLimit: noCooldown ? 0 : (options.dailyLimit ?? 0),
      noCooldown,
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
      const minMs = (options.minDelay || 0) * 1000;
      const maxMs = Math.max((options.maxDelay || 0) * 1000, minMs);
      const randomDelay = maxMs > minMs ? Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs : minMs;
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
                clientId: BigInt(index) as any,
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
        const pauseMs = (options.batchPauseMin || 0) * 60 * 1000;
        if (pauseMs > 0) {
          console.log(`[Campaign] Batch pause ${options.batchPauseMin}min`);
          this.campaign.timer = setTimeout(() => this._campaignNext(), pauseMs);
        } else {
          this.campaign.timer = setTimeout(() => this._campaignNext(), randomDelay);
        }
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
      const blob = new Blob([buffer as any], { type: ct });
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
    if (this.handlerClient === this.tgClient) return;
    this.tgClient.addEventHandler((event: any) => this.handleMessage(event), new NewMessage({}));
    this.handlerClient = this.tgClient;
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
        if (cmd === "choose") { const opts = args.join(" ").split(/\s*[\|\/,]\s*/).map((s: string)=>s.trim()).filter(Boolean); await send(opts.length>=2?`I pick: *${opts[Math.floor(Math.random()*opts.length)]}* 🎯`:"Give options: .choose a | b | c"); return; }
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
