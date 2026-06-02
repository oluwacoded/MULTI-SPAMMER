// ─── Gmail Engine — SMTP email campaign sender (nodemailer) ──────────────────
import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import nodemailer from "nodemailer";

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

function readJSON<T>(file: string, def: T): T {
  try {
    const p = path.join(DATA_DIR, file);
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {}
  return def;
}
function writeJSON(file: string, data: unknown) {
  try { fs.writeFileSync(path.join(DATA_DIR, file), JSON.stringify(data, null, 2)); } catch {}
}
function listSubdir(subdir: string): string[] {
  const dir = path.join(DATA_DIR, subdir);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return fs.readdirSync(dir).filter(f => f.endsWith(".json")).sort().reverse();
}

export interface GmailConfig { email: string; appPassword: string; fromName: string; }
export interface EmailContact { email: string; name?: string; }

interface EmailCampaignState {
  active: boolean;
  contacts: EmailContact[];
  index: number;
  subject: string;
  html: string;
  sent: number;
  failed: number;
  skipped: number;
  startTime: number | null;
  timer: any;
  log: any[];
  options: any;
}

class GmailEngine {
  private campaign: EmailCampaignState = {
    active: false, contacts: [], index: 0, subject: "", html: "",
    sent: 0, failed: 0, skipped: 0, startTime: null, timer: null, log: [], options: {},
  };

  getConfig(): GmailConfig {
    const c = readJSON<Partial<GmailConfig>>("gmail_config.json", {});
    return { email: c.email || "", appPassword: c.appPassword || "", fromName: c.fromName || "" };
  }

  hasConfig(): boolean {
    const c = this.getConfig();
    return !!c.email && !!c.appPassword;
  }

  setConfig(cfg: Partial<GmailConfig>) {
    const cur = this.getConfig();
    const next: GmailConfig = {
      email: cfg.email ?? cur.email,
      appPassword: cfg.appPassword ? cfg.appPassword : cur.appPassword,
      fromName: cfg.fromName ?? cur.fromName,
    };
    if (!next.email || !next.appPassword) throw new Error("Gmail address and App Password required");
    writeJSON("gmail_config.json", next);
  }

  publicConfig() {
    const c = this.getConfig();
    return { email: c.email, fromName: c.fromName, hasPassword: !!c.appPassword };
  }

  private transporter() {
    const c = this.getConfig();
    if (!c.email || !c.appPassword) throw new Error("Gmail not configured — save your address and App Password first");
    return nodemailer.createTransport({
      service: "gmail",
      auth: { user: c.email, pass: c.appPassword.replace(/\s/g, "") },
    });
  }

  async verify(): Promise<{ ok: boolean; message: string }> {
    try {
      await this.transporter().verify();
      return { ok: true, message: "Gmail SMTP connection verified" };
    } catch (e: any) {
      return { ok: false, message: e?.message || "Verification failed" };
    }
  }

  async sendTest(to: string, subject: string, html: string): Promise<{ ok: boolean; message: string }> {
    const c = this.getConfig();
    try {
      const info = await this.transporter().sendMail({
        from: c.fromName ? `"${c.fromName}" <${c.email}>` : c.email,
        to, subject, html,
      });
      return { ok: true, message: `Sent (${info.messageId})` };
    } catch (e: any) {
      return { ok: false, message: e?.message || "Send failed" };
    }
  }

  // ─── Templates ────────────────────────────────────────────────────────────
  getTemplates(): any[] { return readJSON<any[]>("email_templates.json", []); }
  saveTemplate(name: string, design: any, html: string) {
    const t = this.getTemplates();
    const item = { id: randomUUID(), name, design, html, createdAt: Date.now() };
    t.push(item);
    writeJSON("email_templates.json", t);
    return item;
  }
  deleteTemplate(id: string) {
    writeJSON("email_templates.json", this.getTemplates().filter(t => t.id !== id));
  }

  // ─── Campaign ─────────────────────────────────────────────────────────────
  getStatus() {
    if (!this.campaign.active && !this.campaign.log.length) {
      return { active: false, configured: this.hasConfig() };
    }
    const total = this.campaign.contacts.length;
    const done = this.campaign.sent + this.campaign.failed + this.campaign.skipped;
    return {
      active: this.campaign.active,
      configured: this.hasConfig(),
      total,
      sent: this.campaign.sent,
      failed: this.campaign.failed,
      skipped: this.campaign.skipped,
      percent: total > 0 ? Math.round(done / total * 100) : 0,
      subject: this.campaign.subject,
      log: this.campaign.log.slice(-200),
    };
  }

  async start(contacts: EmailContact[], subject: string, html: string, options: any = {}) {
    if (!this.hasConfig()) throw new Error("Gmail not configured");
    if (this.campaign.active) throw new Error("An email campaign is already running");
    const valid = (contacts || []).filter(c => c.email && /\S+@\S+\.\S+/.test(c.email));
    if (!valid.length) throw new Error("No valid email addresses in contacts");
    if (!subject || !html) throw new Error("Subject and email body required");
    this.campaign = {
      active: true, contacts: valid, index: 0, subject, html,
      sent: 0, failed: 0, skipped: 0, startTime: Date.now(), timer: null, log: [],
      options: { minDelay: options.minDelay ?? 3, maxDelay: options.maxDelay ?? 8 },
    };
    this._next();
  }

  stop() {
    if (!this.campaign.active) return;
    clearTimeout(this.campaign.timer);
    this.campaign.active = false;
    this._saveHistory();
  }

  private _saveHistory() {
    if (!this.campaign.startTime || !this.campaign.contacts.length) return;
    try {
      const dir = path.join(DATA_DIR, "email-campaign-history");
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const id = this.campaign.startTime.toString();
      fs.writeFileSync(path.join(dir, `${id}.json`), JSON.stringify({
        id,
        startTime: this.campaign.startTime,
        endTime: Date.now(),
        total: this.campaign.contacts.length,
        sent: this.campaign.sent,
        failed: this.campaign.failed,
        skipped: this.campaign.skipped,
        subject: this.campaign.subject,
        log: this.campaign.log,
      }, null, 2));
    } catch {}
  }

  private _next() {
    if (!this.campaign.active) return;
    const { contacts, index, subject, html, options } = this.campaign;
    if (index >= contacts.length) {
      this.campaign.active = false;
      this._saveHistory();
      return;
    }
    const contact = contacts[index];
    this.campaign.index++;
    const c = this.getConfig();

    (async () => {
      const minMs = (options.minDelay || 3) * 1000;
      const maxMs = (options.maxDelay || 8) * 1000;
      const delay = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
      const entry: any = { email: contact.email, name: contact.name || "", status: "pending", at: Date.now() };
      this.campaign.log.push(entry);
      if (this.campaign.log.length > 500) this.campaign.log = this.campaign.log.slice(-500);

      try {
        const name = contact.name || "";
        const personalSubject = subject.replace(/\{name\}/gi, name).replace(/\{email\}/gi, contact.email);
        const personalHtml = html.replace(/\{name\}/gi, name).replace(/\{email\}/gi, contact.email);
        await this.transporter().sendMail({
          from: c.fromName ? `"${c.fromName}" <${c.email}>` : c.email,
          to: contact.email,
          subject: personalSubject,
          html: personalHtml,
        });
        this.campaign.sent++;
        entry.status = "sent";
        entry.at = Date.now();
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
    return listSubdir("email-campaign-history").slice(0, 100).map(f => {
      const id = f.replace(".json", "");
      const data = this._readHistItem(id);
      if (!data) return null;
      return {
        id: data.id, startTime: data.startTime, endTime: data.endTime,
        total: data.total, sent: data.sent, failed: data.failed, skipped: data.skipped,
        subject: data.subject,
      };
    }).filter(Boolean);
  }
  private _readHistItem(id: string): any {
    const fp = path.join(DATA_DIR, "email-campaign-history", `${id}.json`);
    if (!fs.existsSync(fp)) return null;
    try { return JSON.parse(fs.readFileSync(fp, "utf8")); } catch { return null; }
  }
  getHistoryItem(id: string) { return this._readHistItem(id); }
  deleteHistory(id: string): boolean {
    const fp = path.join(DATA_DIR, "email-campaign-history", `${id}.json`);
    if (!fs.existsSync(fp)) return false;
    fs.unlinkSync(fp);
    return true;
  }
}

let _engine: GmailEngine | null = null;
export function getGmailEngine(): GmailEngine {
  if (!_engine) _engine = new GmailEngine();
  return _engine;
}
