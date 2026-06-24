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
  private campaign: any = {
    active: false, contacts: [], index: 0, message: "",
    sent: 0, failed: 0, noWhatsapp: 0, startTime: null, timer: null, log: [], options: {},
  };

  async connect(): Promise<void> {
    if (this.connecting || this.connected) return;
    this.connecting = true;
    this.lastError = "";
    try {
      const baileys: any = await import("@whiskeysockets/baileys");
      const makeWASocket = baileys.default || baileys.makeWASocket;
      const { useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, downloadMediaMessage } = baileys;

      if (!fs.existsSync(WA_AUTH_DIR)) fs.mkdirSync(WA_AUTH_DIR, { recursive: true });
      const { state, saveCreds } = await useMultiFileAuthState(WA_AUTH_DIR);
      let version: any = undefined;
      try { ({ version } = await fetchLatestBaileysVersion()); } catch {}

      const sock = makeWASocket({
        auth: state,
        version,
        printQRInTerminal: false,
        markOnlineOnConnect: false,
        syncFullHistory: false,
      });
      this.sock = sock;

      sock.ev.on("creds.update", saveCreds);

      sock.ev.on("connection.update", async (update: any) => {
        const { connection, lastDisconnect, qr } = update;
        if (qr) {
          try { this.qrDataUrl = await qrcode.toDataURL(qr); } catch {}
        }
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
            try { fs.rmSync(WA_AUTH_DIR, { recursive: true, force: true }); } catch {}
            this.connecting = false;
            this.qrDataUrl = null;
          } else {
            console.log("[WhatsApp] Connection closed, reconnecting...");
            this.connecting = false;
            setTimeout(() => this.connect().catch(() => {}), 3000);
          }
        }
      });

      // Reply ".vv" to a view-once photo/video/voice note and we re-send the
      // media as a normal (replayable) message into the SAME chat. Only the
      // linked account owner (fromMe) can trigger it.
      sock.ev.on("messages.upsert", async (ev: any) => {
        if (ev?.type && ev.type !== "notify") return;
        for (const msg of ev?.messages || []) {
          try {
            await this._maybeUnlockViewOnce(sock, downloadMediaMessage, msg);
          } catch (e: any) {
            console.log("[WhatsApp] .vv handler error:", e?.message || e);
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
    if (!this.sock) {
      await this.connect();
      // Give Baileys a moment to bring the socket up before requesting a code.
      await new Promise((r) => setTimeout(r, 2000));
    }
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

  async logout(): Promise<void> {
    try { if (this.sock) await this.sock.logout(); } catch {}
    this.sock = null;
    this.connected = false;
    this.connecting = false;
    this.qrDataUrl = null;
    this.me = null;
    try { fs.rmSync(WA_AUTH_DIR, { recursive: true, force: true }); } catch {}
  }

  // ─── ".vv" view-once unlocker ───────────────────────────────────────────────
  // A no-op logger so Baileys' downloadMediaMessage never crashes if it logs.
  private _silentLogger(): any {
    const noop = () => {};
    const l: any = { level: "silent", trace: noop, debug: noop, info: noop, warn: noop, error: noop, fatal: noop };
    l.child = () => l;
    return l;
  }

  private async _maybeUnlockViewOnce(sock: any, downloadMediaMessage: any, msg: any): Promise<void> {
    // Only the linked account owner may trigger it.
    if (!msg?.key?.fromMe) return;
    const outer = msg.message;
    if (!outer) return;
    const content = outer.ephemeralMessage?.message || outer;
    const ext = content.extendedTextMessage;
    if (!ext) return;
    const body = (ext.text || "").trim().toLowerCase();
    if (body !== ".vv" && body !== ".v") return;

    const ctxInfo = ext.contextInfo;
    const quotedRaw = ctxInfo?.quotedMessage;
    if (!quotedRaw) return;

    // Unwrap disappearing-message + view-once wrappers around the quoted message.
    let inner = quotedRaw.ephemeralMessage?.message || quotedRaw;
    const vo =
      inner.viewOnceMessageV2Extension || inner.viewOnceMessageV2 || inner.viewOnceMessage;
    if (vo?.message) inner = vo.message;

    const img = inner.imageMessage;
    const vid = inner.videoMessage;
    const aud = inner.audioMessage;
    if (!img && !vid && !aud) return; // the reply wasn't to a media message

    const remoteJid = msg.key.remoteJid;
    if (!remoteJid) return;

    const fakeMsg = {
      key: {
        remoteJid: ctxInfo.remoteJid || remoteJid,
        id: ctxInfo.stanzaId,
        fromMe: false,
        participant: ctxInfo.participant,
      },
      message: inner,
    };

    try {
      const buffer: Buffer = await downloadMediaMessage(
        fakeMsg,
        "buffer",
        {},
        { logger: this._silentLogger(), reuploadRequest: sock.updateMediaMessage },
      );
      if (!buffer || !buffer.length) throw new Error("empty media");
      if (img) {
        await sock.sendMessage(remoteJid, { image: buffer, caption: img.caption || undefined });
      } else if (vid) {
        await sock.sendMessage(remoteJid, { video: buffer, caption: vid.caption || undefined });
      } else if (aud) {
        await sock.sendMessage(remoteJid, {
          audio: buffer,
          mimetype: aud.mimetype || "audio/ogg; codecs=opus",
          ptt: !!aud.ptt,
        });
      }
    } catch (e: any) {
      console.log("[WhatsApp] .vv unlock failed:", e?.message || e);
      try {
        await sock.sendMessage(remoteJid, {
          text: "⚠️ Couldn't unlock that view-once (it may have expired or already been opened).",
        });
      } catch {}
    }
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
