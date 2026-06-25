// ─── WhatsApp Engine — Baileys QR connector + bulk campaign ──────────────────
import fs from "fs";
import path from "path";
import qrcode from "qrcode";

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");
const WA_AUTH_DIR = path.join(DATA_DIR, "whatsapp-auth");

function readJSON<T>(file: string, def: T): T {
  try {
    const p = path.join(DATA_DIR, file);
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {}
  return def;
}
function listSubdir(subdir: string): string[] {
  const dir = path.join(DATA_DIR, subdir);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return fs.readdirSync(dir).filter(f => f.endsWith(".json")).sort().reverse();
}

export interface WaContact { phone: string; name?: string; }

class WhatsAppEngine {
  private sock: any = null;
  private connecting = false;
  private connected = false;
  private qrDataUrl: string | null = null;
  private me: any = null;
  private lastError = "";
  private socketReady = false;
  private generation = 0;
  private campaign: any = {
    active: false, contacts: [], index: 0, message: "",
    sent: 0, failed: 0, noWhatsapp: 0, startTime: null, timer: null, log: [], options: {},
  };

  async connect(opts: { fresh?: boolean } = {}): Promise<void> {
    if (opts.fresh) {
      // A fresh relink is destructive (wipes the session) — never do it while a
      // campaign is sending.
      if (this.campaign.active) {
        throw new Error("Stop the running WhatsApp campaign before re-linking");
      }
      // Start a brand-new, unregistered session. Stale/partial auth files are
      // the most common cause of WhatsApp's "Couldn't link device" error.
      // Bump the generation BEFORE teardown so any close fired during end() is
      // already treated as stale (no rogue reconnect / state mutation).
      this.generation++;
      try { this.sock?.end?.(new Error("relink")); } catch {}
      this.sock = null;
      this.connected = false;
      this.connecting = false;
      this.qrDataUrl = null;
      this._clearAuth();
    }
    if (this.connecting || this.connected) return;
    this.connecting = true;
    const myGen = ++this.generation;
    this.socketReady = false;
    this.lastError = "";
    try {
      const baileys: any = await import("@whiskeysockets/baileys");
      const makeWASocket = baileys.default || baileys.makeWASocket;
      const { useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, Browsers } = baileys;

      if (!fs.existsSync(WA_AUTH_DIR)) fs.mkdirSync(WA_AUTH_DIR, { recursive: true });
      const { state, saveCreds } = await useMultiFileAuthState(WA_AUTH_DIR);
      let version: any = undefined;
      try { ({ version } = await fetchLatestBaileysVersion()); } catch {}

      // A newer connect()/relink may have superseded us during the awaits above.
      // Bail without touching shared state — the newer call owns it.
      if (myGen !== this.generation) return;

      const sock = makeWASocket({
        auth: state,
        version,
        printQRInTerminal: false,
        markOnlineOnConnect: false,
        syncFullHistory: false,
        browser: Browsers.ubuntu("Chrome"),
      });

      // Re-check before publishing the socket; if superseded, discard it.
      if (myGen !== this.generation) {
        try { sock.end?.(new Error("superseded")); } catch {}
        return;
      }
      this.sock = sock;

      // Ignore events from superseded sockets (after a fresh relink or a
      // reconnect). Without this, an old socket's "close" event would null out
      // the new socket and could spawn a rogue reconnect mid-pairing.
      const isStale = () => myGen !== this.generation;

      sock.ev.on("creds.update", async () => {
        if (isStale()) return;
        await saveCreds();
      });

      sock.ev.on("connection.update", async (update: any) => {
        if (isStale()) return;
        const { connection, lastDisconnect, qr } = update;
        if (qr) {
          this.socketReady = true;
          try {
            const url = await qrcode.toDataURL(qr);
            if (!isStale()) this.qrDataUrl = url;
          } catch {}
        }
        if (connection === "connecting") this.socketReady = true;
        if (connection === "open") {
          this.connected = true;
          this.connecting = false;
          this.qrDataUrl = null;
          this.me = sock.user;
          console.log("[WhatsApp] ✅ Connected as", sock.user?.id);
        } else if (connection === "close") {
          this.connected = false;
          const code = lastDisconnect?.error?.output?.statusCode;
          const loggedOut = code === DisconnectReason.loggedOut;
          this.lastError = lastDisconnect?.error?.message || "";
          this.sock = null;
          if (loggedOut) {
            console.log("[WhatsApp] Logged out — clearing session");
            this._clearAuth();
            this.connecting = false;
            this.qrDataUrl = null;
          } else if (code === DisconnectReason.connectionReplaced) {
            // Another login took over this session (e.g. a second backend
            // running the same account). Do NOT auto-reconnect — that just
            // fights the other session in a loop and never settles.
            console.log("[WhatsApp] Connection replaced by another session — not reconnecting");
            this.connecting = false;
            this.qrDataUrl = null;
          } else {
            // Code 515 ("restart required") fires immediately after a successful
            // pairing/login while the PHONE is still waiting on the link. Any
            // delay here lets the phone time out with "Couldn't link device",
            // even though the backend would have finished. So reconnect instantly
            // on 515; use a short backoff for ordinary network drops.
            const restartRequired = code === DisconnectReason.restartRequired;
            console.log(
              `[WhatsApp] Connection closed (code ${code ?? "?"}) — reconnecting ${restartRequired ? "now" : "shortly"}...`,
            );
            this.connecting = false;
            const reconnectGen = myGen;
            setTimeout(() => {
              // Skip if a logout/relink superseded this socket meanwhile.
              if (reconnectGen === this.generation) this.connect().catch(() => {});
            }, restartRequired ? 0 : 3000);
          }
        }
      });
    } catch (e: any) {
      this.connecting = false;
      this.lastError = e?.message || "Failed to start WhatsApp";
      console.log("[WhatsApp] Error:", this.lastError);
      throw e;
    }
  }

  // Request an 8-character pairing code so the user can link WhatsApp by typing
  // a code on their phone instead of scanning a QR. Baileys requires the socket
  // to exist and the account to be unregistered; the code must be requested
  // shortly after the socket comes up.
  async requestPairingCode(phone: string): Promise<string> {
    const digits = (phone || "").replace(/\D/g, "");
    if (!digits || digits.length < 8) {
      throw new Error("Send your full phone number with country code, e.g. 15551234567");
    }
    if (this.connected) throw new Error("WhatsApp is already connected");
    // Always pair from a clean, unregistered session — leftover/partial auth
    // files make WhatsApp reject the link ("Couldn't link device").
    // connect({ fresh }) also guards against wiping an active campaign.
    await this.connect({ fresh: true });
    // Wait until the socket is genuinely ready to register. A QR event means the
    // noise handshake finished and the unregistered socket can pair — the
    // strongest readiness signal. Fall back to the weaker "connecting" flag.
    const deadline = Date.now() + 20000;
    while (!this.qrDataUrl && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 300));
    }
    if (!this.qrDataUrl) {
      const fallback = Date.now() + 5000;
      while (!this.socketReady && Date.now() < fallback) {
        await new Promise((r) => setTimeout(r, 300));
      }
    }
    // Small settle so Baileys finishes its handshake before we register.
    await new Promise((r) => setTimeout(r, 1000));
    if (!this.sock) throw new Error("WhatsApp socket not ready — try again in a few seconds");
    if (this.sock.authState?.creds?.registered) {
      throw new Error("This session is already registered");
    }
    if (typeof this.sock.requestPairingCode !== "function") {
      throw new Error("Pairing code not supported by this WhatsApp version — use the QR code");
    }
    const code = await this.sock.requestPairingCode(digits);
    return code;
  }

  private _clearAuth(): void {
    try { fs.rmSync(WA_AUTH_DIR, { recursive: true, force: true }); } catch {}
  }

  async logout(): Promise<void> {
    // Invalidate the live socket first so its close/reconnect handler is stale
    // and won't auto-reconnect after we tear down.
    this.generation++;
    try { if (this.sock) await this.sock.logout(); } catch {}
    this.sock = null;
    this.connected = false;
    this.connecting = false;
    this.qrDataUrl = null;
    this.me = null;
    this.socketReady = false;
    this._clearAuth();
  }

  getStatus() {
    return {
      connected: this.connected,
      connecting: this.connecting,
      qr: this.qrDataUrl,
      me: this.me ? { id: this.me.id, name: this.me.name || this.me.verifiedName || "" } : null,
      lastError: this.lastError,
      campaign: this.getCampaignStatus(),
    };
  }

  getCampaignStatus() {
    if (!this.campaign.active && !this.campaign.log.length) return { active: false };
    const total = this.campaign.contacts.length;
    const done = this.campaign.sent + this.campaign.failed + this.campaign.noWhatsapp;
    return {
      active: this.campaign.active,
      total,
      sent: this.campaign.sent,
      failed: this.campaign.failed,
      noWhatsapp: this.campaign.noWhatsapp,
      percent: total > 0 ? Math.round(done / total * 100) : 0,
      log: this.campaign.log.slice(-200),
    };
  }

  async startCampaign(contacts: WaContact[], message: string, options: any = {}) {
    if (!this.connected || !this.sock) throw new Error("WhatsApp not connected — scan the QR code first");
    if (this.campaign.active) throw new Error("A WhatsApp campaign is already running");
    const valid = (contacts || []).filter(c => c.phone && /\d{6,}/.test(c.phone));
    if (!valid.length) throw new Error("No valid phone numbers in contacts");
    if (!message) throw new Error("Message required");
    this.campaign = {
      active: true, contacts: valid, index: 0, message,
      sent: 0, failed: 0, noWhatsapp: 0, startTime: Date.now(), timer: null, log: [],
      options: { minDelay: options.minDelay ?? 4, maxDelay: options.maxDelay ?? 10 },
    };
    this._next();
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
      const dir = path.join(DATA_DIR, "whatsapp-campaign-history");
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const id = this.campaign.startTime.toString();
      fs.writeFileSync(path.join(dir, `${id}.json`), JSON.stringify({
        id,
        startTime: this.campaign.startTime,
        endTime: Date.now(),
        total: this.campaign.contacts.length,
        sent: this.campaign.sent,
        failed: this.campaign.failed,
        noWhatsapp: this.campaign.noWhatsapp,
        message: (this.campaign.message || "").slice(0, 120),
        log: this.campaign.log,
      }, null, 2));
    } catch {}
  }

  private _next() {
    if (!this.campaign.active) return;
    const { contacts, index, message, options } = this.campaign;
    if (index >= contacts.length) {
      this.campaign.active = false;
      this._saveHistory();
      return;
    }
    const contact = contacts[index];
    this.campaign.index++;

    (async () => {
      const minMs = (options.minDelay || 4) * 1000;
      const maxMs = (options.maxDelay || 10) * 1000;
      const delay = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
      const entry: any = { phone: contact.phone, name: contact.name || "", status: "pending", at: Date.now() };
      this.campaign.log.push(entry);
      if (this.campaign.log.length > 500) this.campaign.log = this.campaign.log.slice(-500);

      try {
        const digits = contact.phone.replace(/\D/g, "");
        const results = await this.sock.onWhatsApp(digits);
        const exists = results?.[0]?.exists;
        const jid = results?.[0]?.jid || `${digits}@s.whatsapp.net`;
        if (!exists) {
          this.campaign.noWhatsapp++;
          entry.status = "no_whatsapp";
          entry.at = Date.now();
        } else {
          const personal = message.replace(/\{name\}/gi, contact.name || "").replace(/\{phone\}/gi, contact.phone);
          await this.sock.sendMessage(jid, { text: personal });
          this.campaign.sent++;
          entry.status = "sent";
          entry.at = Date.now();
        }
      } catch (e: any) {
        this.campaign.failed++;
        entry.status = "error";
        entry.error = (e?.message || "send failed").slice(0, 120);
        entry.at = Date.now();
      }
      this.campaign.timer = setTimeout(() => this._next(), delay);
    })();
  }

  // ─── History ──────────────────────────────────────────────────────────────
  getHistory() {
    return listSubdir("whatsapp-campaign-history").slice(0, 100).map(f => {
      const id = f.replace(".json", "");
      const data = this._readHistItem(id);
      if (!data) return null;
      return {
        id: data.id, startTime: data.startTime, endTime: data.endTime,
        total: data.total, sent: data.sent, failed: data.failed, noWhatsapp: data.noWhatsapp,
        message: data.message,
      };
    }).filter(Boolean);
  }
  private _readHistItem(id: string): any {
    const fp = path.join(DATA_DIR, "whatsapp-campaign-history", `${id}.json`);
    if (!fs.existsSync(fp)) return null;
    try { return JSON.parse(fs.readFileSync(fp, "utf8")); } catch { return null; }
  }
  getHistoryItem(id: string) { return this._readHistItem(id); }
  deleteHistory(id: string): boolean {
    const fp = path.join(DATA_DIR, "whatsapp-campaign-history", `${id}.json`);
    if (!fs.existsSync(fp)) return false;
    fs.unlinkSync(fp);
    return true;
  }
}

let _engine: WhatsAppEngine | null = null;
export function getWhatsAppEngine(): WhatsAppEngine {
  if (!_engine) _engine = new WhatsAppEngine();
  return _engine;
}
