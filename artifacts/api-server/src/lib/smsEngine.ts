// ─── SMS Engine — Multi-provider SMS campaign + flasher ──────────────────────
import fs from "fs";
import path from "path";
import { v4 as uuidv4 } from "uuid";

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

const SMS_RATE = 20; // msgs/min safe default

export interface SmsContact { phone: string; name: string; }
export interface SmsSendResult { ok: boolean; messageId: string | null; message: string; provider: string; }

// ─── Provider implementations ────────────────────────────────────────────────

async function sendViaTextbelt(phone: string, message: string, apiKey?: string): Promise<SmsSendResult> {
  const key = apiKey || process.env.TEXTBELT_API_KEY || "textbelt";
  try {
    const r = await fetch("https://textbelt.com/text", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone, message, key }),
      signal: AbortSignal.timeout(15000)
    });
    const d: any = await r.json();
    return { ok: !!d.success, messageId: d.textId || null, message: d.error || "Sent", provider: "textbelt" };
  } catch (e: any) {
    return { ok: false, messageId: null, message: e.message, provider: "textbelt" };
  }
}

async function sendViaTwilio(phone: string, message: string, senderId?: string): Promise<SmsSendResult> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = senderId || process.env.TWILIO_PHONE_NUMBER || "";
  if (!sid || !token || !from) return { ok: false, messageId: null, message: "Twilio not configured (need TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER)", provider: "twilio" };
  try {
    const body = new URLSearchParams({ To: phone, From: from, Body: message });
    const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: "POST",
      headers: { "Authorization": "Basic " + Buffer.from(`${sid}:${token}`).toString("base64"), "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
      signal: AbortSignal.timeout(15000)
    });
    const d: any = await r.json();
    return { ok: r.ok && !d.error_code, messageId: d.sid || null, message: d.error_message || d.status || "Sent", provider: "twilio" };
  } catch (e: any) {
    return { ok: false, messageId: null, message: e.message, provider: "twilio" };
  }
}

async function sendViaTermii(phone: string, message: string, apiKey?: string, senderId?: string): Promise<SmsSendResult> {
  const key = apiKey || process.env.TERMII_API_KEY || "";
  const from = senderId || process.env.TERMII_SENDER_ID || "MFGBot";
  if (!key) return { ok: false, messageId: null, message: "Termii not configured (need TERMII_API_KEY)", provider: "termii" };
  try {
    const r = await fetch("https://api.ng.termii.com/api/sms/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ api_key: key, to: phone, from, sms: message, type: "plain", channel: "generic" }),
      signal: AbortSignal.timeout(15000)
    });
    const d: any = await r.json();
    return { ok: !!d.message_id || r.ok, messageId: d.message_id || null, message: d.message || "Sent", provider: "termii" };
  } catch (e: any) {
    return { ok: false, messageId: null, message: e.message, provider: "termii" };
  }
}

async function sendViaAfricasTalking(phone: string, message: string, apiKey?: string, senderId?: string): Promise<SmsSendResult> {
  const key = apiKey || process.env.AT_API_KEY || "";
  const username = process.env.AT_USERNAME || "sandbox";
  const from = senderId || process.env.AT_SENDER_ID || "";
  if (!key) return { ok: false, messageId: null, message: "Africa's Talking not configured (need AT_API_KEY)", provider: "africas_talking" };
  try {
    const body: any = { username, to: phone, message, apiKey: key };
    if (from) body.from = from;
    const params = new URLSearchParams(body);
    const r = await fetch("https://api.africastalking.com/version1/messaging", {
      method: "POST",
      headers: { "apiKey": key, "Content-Type": "application/x-www-form-urlencoded", "Accept": "application/json" },
      body: params.toString(),
      signal: AbortSignal.timeout(15000)
    });
    const d: any = await r.json();
    const recipient = d.SMSMessageData?.Recipients?.[0];
    return { ok: r.ok && recipient?.status === "Success", messageId: recipient?.messageId || null, message: recipient?.status || d.SMSMessageData?.Message || "Sent", provider: "africas_talking" };
  } catch (e: any) {
    return { ok: false, messageId: null, message: e.message, provider: "africas_talking" };
  }
}

async function sendViaBulkSmsNigeria(phone: string, message: string, apiKey?: string, senderId?: string): Promise<SmsSendResult> {
  const key = apiKey || process.env.BULKSMS_API_KEY || "";
  const from = senderId || "MFGBot";
  if (!key) return { ok: false, messageId: null, message: "BulkSMS Nigeria not configured (need BULKSMS_API_KEY)", provider: "bulksms_ng" };
  try {
    const params = new URLSearchParams({ api_token: key, from, to: phone, body: message });
    const r = await fetch(`https://www.bulksmsnigeria.com/api/v1/sms/create?${params}`, {
      method: "GET",
      signal: AbortSignal.timeout(15000)
    });
    const d: any = await r.json();
    return { ok: r.ok && d.data?.status !== "failed", messageId: d.data?.id?.toString() || null, message: d.data?.status || "Sent", provider: "bulksms_ng" };
  } catch (e: any) {
    return { ok: false, messageId: null, message: e.message, provider: "bulksms_ng" };
  }
}

// ─── Main dispatch ────────────────────────────────────────────────────────────

async function dispatchSms(phone: string, message: string, provider: string, senderId?: string, apiKey?: string): Promise<SmsSendResult> {
  switch (provider) {
    case "twilio": return sendViaTwilio(phone, message, senderId);
    case "termii": return sendViaTermii(phone, message, apiKey, senderId);
    case "africas_talking": return sendViaAfricasTalking(phone, message, apiKey, senderId);
    case "bulksms_ng": return sendViaBulkSmsNigeria(phone, message, apiKey, senderId);
    case "textbelt":
    default: return sendViaTextbelt(phone, message, apiKey);
  }
}

// ─── SMS Engine class ─────────────────────────────────────────────────────────

class SmsEngine {
  private campaign: any = { active: false, contacts: [], index: 0, message: "", sent: 0, failed: 0, startTime: null, timer: null, provider: "textbelt", senderId: null };
  private history: any[] = readJSON("sms_history.json", []);

  getStatus() {
    if (!this.campaign.active) return { active: false };
    const total = this.campaign.contacts.length;
    const done = this.campaign.sent + this.campaign.failed;
    return {
      active: true, total, sent: this.campaign.sent, failed: this.campaign.failed,
      elapsed: Math.round((Date.now() - this.campaign.startTime) / 60000),
      remain: Math.ceil((total - done) / SMS_RATE),
      percent: Math.round(done / total * 100),
      provider: this.campaign.provider
    };
  }

  async startCampaign({ contacts, message, provider = "textbelt", senderId }: { contacts: SmsContact[]; message: string; provider?: string; senderId?: string }) {
    if (this.campaign.active) throw new Error("An SMS campaign is already running");
    if (!contacts.length) throw new Error("No contacts");

    this.campaign = {
      active: true, contacts, index: 0, message, sent: 0, failed: 0,
      startTime: Date.now(), timer: null, provider, senderId: senderId || null,
      delayMs: Math.ceil(60000 / SMS_RATE)
    };
    console.log(`[SMS] Campaign started — ${contacts.length} contacts via ${provider}`);
    this._next();
  }

  private _next() {
    if (!this.campaign.active) return;
    const { contacts, index, message, provider, senderId } = this.campaign;
    if (index >= contacts.length) {
      this.campaign.active = false;
      console.log(`[SMS] Campaign complete — Sent: ${this.campaign.sent}, Failed: ${this.campaign.failed}`);
      return;
    }
    const { phone, name } = contacts[index];
    this.campaign.index++;
    const personalised = message.replace(/\{name\}/gi, name).replace(/\{phone\}/gi, phone);

    (async () => {
      const settings = readJSON("settings.json", {});
      const apiKey = settings.smsApiKey || process.env.SMS_API_KEY || "";
      const result = await dispatchSms(phone, personalised, provider, senderId, apiKey);
      this._recordHistory({ phone, message: personalised, provider, result });
      if (result.ok) this.campaign.sent++;
      else { this.campaign.failed++; console.log(`[SMS] Failed → ${phone}:`, result.message); }
      this.campaign.timer = setTimeout(() => this._next(), this.campaign.delayMs);
    })();
  }

  stopCampaign() {
    if (!this.campaign.active) return;
    clearTimeout(this.campaign.timer);
    this.campaign.active = false;
  }

  async sendOne({ phone, message, provider, senderId }: { phone: string; message: string; provider?: string; senderId?: string }): Promise<SmsSendResult> {
    const p = provider || "textbelt";
    const settings = readJSON("settings.json", {});
    const apiKey = settings.smsApiKey || process.env.SMS_API_KEY || "";
    const result = await dispatchSms(phone, message, p, senderId, apiKey);
    this._recordHistory({ phone, message, provider: p, result });
    return result;
  }

  private _recordHistory({ phone, message, provider, result }: any) {
    const entry = { id: uuidv4(), phone, message: message.slice(0, 160), status: result.ok ? "sent" : "failed", provider, at: Date.now(), messageId: result.messageId || null };
    this.history.unshift(entry);
    if (this.history.length > 500) this.history = this.history.slice(0, 500);
    setImmediate(() => writeJSON("sms_history.json", this.history));
  }

  getHistory() { return this.history.slice(0, 100); }

  async getProviders(): Promise<any> {
    const settings = readJSON("settings.json", {});
    const active = settings.smsProvider || "textbelt";
    const providers = [
      { id: "textbelt", name: "Textbelt", configured: true, balance: null },
      { id: "twilio", name: "Twilio", configured: !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN), balance: null },
      { id: "termii", name: "Termii (Nigeria)", configured: !!(process.env.TERMII_API_KEY || settings.smsApiKey), balance: null },
      { id: "africas_talking", name: "Africa's Talking", configured: !!(process.env.AT_API_KEY), balance: null },
      { id: "bulksms_ng", name: "BulkSMS Nigeria", configured: !!(process.env.BULKSMS_API_KEY), balance: null },
    ];
    return { providers, active };
  }
}

let smsInstance: SmsEngine | null = null;

export function getSmsEngine(): SmsEngine {
  if (!smsInstance) smsInstance = new SmsEngine();
  return smsInstance;
}
