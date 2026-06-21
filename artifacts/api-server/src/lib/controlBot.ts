// ─── Telegram Control Bot ────────────────────────────────────────────────────
// A Telegram bot (Bot API, via grammy) that lets the owner drive the whole
// dashboard from inside Telegram: check status, connect WhatsApp (QR + pairing
// code), run WhatsApp campaigns, scrape Telegram groups and mass-add members,
// and send Gmail campaigns. Restricted to a single owner chat id.
//
// Config (via env / secrets):
//   TELEGRAM_CONTROL_BOT_TOKEN  — BotFather token (required; bot is disabled if unset)
//   TELEGRAM_CONTROL_CHAT_ID    — owner chat id; only this chat may use the bot
import { Bot, Keyboard, InlineKeyboard, InputFile } from "grammy";
import { logger } from "./logger";
import { getBotInstance } from "./botInstance";
import { getWhatsAppEngine } from "./whatsappEngine";
import { getGmailEngine } from "./gmailEngine";

// ─── Conversation state ──────────────────────────────────────────────────────
// Simple per-chat step machine for multi-step flows (no external deps).
type FlowName =
  | "wa_pair_phone"
  | "wa_campaign_msg"
  | "wa_campaign_nums"
  | "tg_scrape_source"
  | "tg_scrape_target"
  | "gmail_subject"
  | "gmail_body"
  | "gmail_recipients";

interface FlowState {
  flow: FlowName;
  data: Record<string, any>;
}
const flows = new Map<number, FlowState>();

// ─── Keyboards ───────────────────────────────────────────────────────────────
const B = {
  status: "📊 Status",
  whatsapp: "📱 WhatsApp",
  telegram: "✈️ Telegram",
  gmail: "📧 Gmail",
  help: "❓ Help",
  cancel: "✖️ Cancel",
};

function mainKeyboard() {
  return new Keyboard()
    .text(B.status)
    .row()
    .text(B.telegram)
    .text(B.whatsapp)
    .row()
    .text(B.gmail)
    .text(B.help)
    .resized()
    .persistent();
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
    .text("📈 Add status", "tg_addstatus")
    .text("⏹ Stop add", "tg_stopadd")
    .row()
    .text("👥 Accounts", "tg_accounts");
}

function gmailMenu() {
  return new InlineKeyboard()
    .text("✉️ Send campaign", "gmail_send")
    .row()
    .text("📈 Status", "gmail_status");
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
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

// ─── Status text builders ────────────────────────────────────────────────────
function telegramStatusText(): string {
  try {
    const s: any = getBotInstance().getStatus();
    const accounts: any[] = s.accounts || [];
    const lines = accounts.map((a) => {
      const conn = a.connected ? "🟢" : "⚪️";
      const job = a.addJob?.active
        ? ` — adding ${a.addJob.added}/${a.addJob.total}`
        : "";
      return `${conn} <b>${esc(a.label || a.id)}</b>${esc(job)}`;
    });
    if (!lines.length) return "✈️ <b>Telegram</b>\nNo linked accounts yet. Link one on the website.";
    return "✈️ <b>Telegram accounts</b>\n" + lines.join("\n");
  } catch (e: any) {
    return "✈️ Telegram status unavailable: " + esc(e?.message || e);
  }
}

function whatsappStatusText(): string {
  try {
    const s: any = getWhatsAppEngine().getStatus();
    const state = s.connected
      ? `🟢 Connected${s.me?.name ? " as " + esc(s.me.name) : ""}`
      : s.connecting
      ? "🟡 Connecting…"
      : "⚪️ Not connected";
    const camp = s.campaign?.active
      ? `\n📣 Campaign: ${s.campaign.sent} sent / ${s.campaign.total} (${s.campaign.percent}%)`
      : "";
    const err = s.lastError ? `\n⚠️ ${esc(s.lastError)}` : "";
    return `📱 <b>WhatsApp</b>\n${state}${camp}${err}`;
  } catch (e: any) {
    return "📱 WhatsApp status unavailable: " + esc(e?.message || e);
  }
}

function gmailStatusText(): string {
  try {
    const s: any = getGmailEngine().getStatus();
    const cfg = s.configured ? "🟢 Configured" : "⚪️ Not configured (set it up on the website)";
    const camp = s.active
      ? `\n✉️ Sending: ${s.sent}/${s.total} (${s.percent}%)`
      : s.total
      ? `\nLast run: ${s.sent} sent, ${s.failed} failed, ${s.skipped} skipped`
      : "";
    return `📧 <b>Gmail</b>\n${cfg}${camp}`;
  } catch (e: any) {
    return "📧 Gmail status unavailable: " + esc(e?.message || e);
  }
}

// ─── Bot wiring ──────────────────────────────────────────────────────────────
let _started = false;

export function startControlBot(): void {
  if (_started) return;
  const token = process.env["TELEGRAM_CONTROL_BOT_TOKEN"];
  if (!token) {
    logger.info("Control bot disabled (TELEGRAM_CONTROL_BOT_TOKEN not set)");
    return;
  }

  // Fail closed: refuse to run unrestricted. Without a valid owner chat id the
  // bot could be driven by anyone who finds it, so we don't start at all.
  const ownerRaw = process.env["TELEGRAM_CONTROL_CHAT_ID"];
  const ownerId = ownerRaw ? Number(ownerRaw) : NaN;
  if (!Number.isFinite(ownerId)) {
    logger.error(
      "Control bot NOT started: TELEGRAM_CONTROL_CHAT_ID is missing or invalid (refusing to run unrestricted)",
    );
    return;
  }
  _started = true;

  const bot = new Bot(token);

  // ── Auth: only the owner chat may use the bot ──
  bot.use(async (ctx, next) => {
    if (ctx.chat?.id !== ownerId) {
      try {
        await ctx.reply("⛔️ Not authorized.");
      } catch {}
      return;
    }
    await next();
  });

  const showMain = async (ctx: any, text = "What would you like to do?") => {
    await ctx.reply(text, { reply_markup: mainKeyboard() });
  };

  // ── /start, /menu ──
  bot.command(["start", "menu"], async (ctx) => {
    flows.delete(ctx.chat.id);
    await showMain(
      ctx,
      "🤖 <b>MFG Control Bot</b>\nRun your outreach tools right here. Pick an option below.",
    );
  });

  bot.command("cancel", async (ctx) => {
    flows.delete(ctx.chat.id);
    await showMain(ctx, "Cancelled.");
  });

  // ── Main menu buttons ──
  bot.hears(B.cancel, async (ctx) => {
    flows.delete(ctx.chat.id);
    await showMain(ctx, "Cancelled.");
  });

  bot.hears(B.status, async (ctx) => {
    await ctx.reply(
      [telegramStatusText(), whatsappStatusText(), gmailStatusText()].join("\n\n"),
      { parse_mode: "HTML" },
    );
  });

  bot.hears(B.help, async (ctx) => {
    await ctx.reply(
      "<b>How to use</b>\n" +
        "• 📊 Status — overview of Telegram, WhatsApp, Gmail\n" +
        "• ✈️ Telegram — scrape a group and mass-add members\n" +
        "• 📱 WhatsApp — connect (QR / pairing code) and run a campaign\n" +
        "• 📧 Gmail — send an email campaign\n\n" +
        "Credentials (Telegram API keys, Gmail login) are set on the website. " +
        "Type /cancel anytime to stop a step.",
      { parse_mode: "HTML", reply_markup: mainKeyboard() },
    );
  });

  bot.hears(B.whatsapp, async (ctx) => {
    await ctx.reply(whatsappStatusText(), { parse_mode: "HTML", reply_markup: waMenu() });
  });

  bot.hears(B.telegram, async (ctx) => {
    await ctx.reply(telegramStatusText(), { parse_mode: "HTML", reply_markup: tgMenu() });
  });

  bot.hears(B.gmail, async (ctx) => {
    await ctx.reply(gmailStatusText(), { parse_mode: "HTML", reply_markup: gmailMenu() });
  });

  // ── WhatsApp inline actions ──
  bot.callbackQuery("wa_status", async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.reply(whatsappStatusText(), { parse_mode: "HTML", reply_markup: waMenu() });
  });

  bot.callbackQuery("wa_qr", async (ctx) => {
    await ctx.answerCallbackQuery();
    const wa = getWhatsAppEngine();
    const st: any = wa.getStatus();
    if (st.connected) {
      await ctx.reply("🟢 WhatsApp is already connected.");
      return;
    }
    await ctx.reply("⏳ Generating QR code… scan it from WhatsApp → Linked devices.");
    wa.connect().catch((e) => logger.error({ err: e }, "wa connect"));
    // Poll for the QR for up to ~25s.
    let sent = false;
    for (let i = 0; i < 12; i++) {
      await new Promise((r) => setTimeout(r, 2200));
      const s: any = wa.getStatus();
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
    if (!sent) await ctx.reply("Couldn't get a QR code. Try again or use a pairing code.");
  });

  bot.callbackQuery("wa_pair", async (ctx) => {
    await ctx.answerCallbackQuery();
    if (getWhatsAppEngine().getStatus().connected) {
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
    if (!getWhatsAppEngine().getStatus().connected) {
      await ctx.reply("Connect WhatsApp first (QR or pairing code).");
      return;
    }
    flows.set(ctx.chat!.id, { flow: "wa_campaign_msg", data: {} });
    await ctx.reply(
      "Send the message to broadcast. You can use {name} as a placeholder.",
      { reply_markup: cancelKeyboard() },
    );
  });

  bot.callbackQuery("wa_logout", async (ctx) => {
    await ctx.answerCallbackQuery();
    await getWhatsAppEngine().logout();
    await ctx.reply("🚪 WhatsApp logged out.");
  });

  // ── Telegram inline actions ──
  bot.callbackQuery("tg_accounts", async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.reply(telegramStatusText(), { parse_mode: "HTML", reply_markup: tgMenu() });
  });

  bot.callbackQuery("tg_addstatus", async (ctx) => {
    await ctx.answerCallbackQuery();
    try {
      const s: any = getBotInstance().getAddStatus();
      if (!s || !s.active) {
        await ctx.reply("No add job running.");
        return;
      }
      const tgt =
        s.targetsTotal > 1
          ? `\nTarget ${s.targetIndex + 1}/${s.targetsTotal}: ${esc(s.currentTarget || "")}`
          : "";
      await ctx.reply(
        `⚙️ Adding ${s.added}/${s.total} — ✅ ${s.added} ❌ ${s.failed || 0}${tgt}`,
        { parse_mode: "HTML" },
      );
    } catch (e: any) {
      await ctx.reply("Status error: " + esc(e?.message || e));
    }
  });

  bot.callbackQuery("tg_stopadd", async (ctx) => {
    await ctx.answerCallbackQuery();
    try {
      getBotInstance().stopAddJob();
      await ctx.reply("⏹ Add job stopped.");
    } catch (e: any) {
      await ctx.reply("Error: " + esc(e?.message || e));
    }
  });

  bot.callbackQuery("tg_scrape", async (ctx) => {
    await ctx.answerCallbackQuery();
    flows.set(ctx.chat!.id, { flow: "tg_scrape_source", data: {} });
    await ctx.reply(
      "Send the SOURCE group link/username to scrape members from (e.g. @group or https://t.me/group):",
      { reply_markup: cancelKeyboard() },
    );
  });

  // ── Gmail inline actions ──
  bot.callbackQuery("gmail_status", async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.reply(gmailStatusText(), { parse_mode: "HTML", reply_markup: gmailMenu() });
  });

  bot.callbackQuery("gmail_send", async (ctx) => {
    await ctx.answerCallbackQuery();
    if (!getGmailEngine().getStatus().configured) {
      await ctx.reply("Gmail isn't configured yet — set the email + app password on the website.");
      return;
    }
    flows.set(ctx.chat!.id, { flow: "gmail_subject", data: {} });
    await ctx.reply("Send the email SUBJECT:", { reply_markup: cancelKeyboard() });
  });

  // ── Free-text handler: drive active flows ──
  bot.on("message:text", async (ctx) => {
    const chatId = ctx.chat.id;
    const text = ctx.message.text.trim();
    const state = flows.get(chatId);
    // Ignore menu button labels here (handled by hears()).
    if (!state) return;

    try {
      switch (state.flow) {
        case "wa_pair_phone": {
          flows.delete(chatId);
          await ctx.reply("⏳ Requesting pairing code…");
          const code = await getWhatsAppEngine().requestPairingCode(text);
          await ctx.reply(
            `🔢 Pairing code: <b>${esc(code)}</b>\n\nOn your phone: WhatsApp → Linked devices → Link with phone number → enter this code.`,
            { parse_mode: "HTML", reply_markup: mainKeyboard() },
          );
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
          const contacts = parseNumbers(text);
          if (!contacts.length) {
            await showMain(ctx, "No valid numbers found. Cancelled.");
            break;
          }
          await getWhatsAppEngine().startCampaign(contacts, state.data.message, {});
          await showMain(
            ctx,
            `📣 WhatsApp campaign started for ${contacts.length} numbers. Check 📊 Status for progress.`,
          );
          break;
        }

        case "tg_scrape_source": {
          state.data.source = text;
          state.flow = "tg_scrape_target";
          await ctx.reply(
            "Now send the TARGET group(s) to add members into. For multiple, separate with new lines:",
            { reply_markup: cancelKeyboard() },
          );
          break;
        }

        case "tg_scrape_target": {
          flows.delete(chatId);
          const source = state.data.source as string;
          const targets = text
            .split(/[\n,]+/)
            .map((t) => t.trim())
            .filter(Boolean);
          if (!targets.length) {
            await showMain(ctx, "No target group given. Cancelled.");
            break;
          }
          await ctx.reply("🔎 Scraping members… this can take a moment.");
          const engine = getBotInstance();
          const members = await engine.scrapeGroup(source);
          if (!members.length) {
            await showMain(ctx, "No members scraped (check the link/permissions).");
            break;
          }
          await engine.startAddJob(targets, members, {});
          await showMain(
            ctx,
            `⚙️ Scraped ${members.length} members. Adding into ${targets.length} target(s). Use ✈️ Telegram → Add status to follow along.`,
          );
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
          const recipients = parseEmails(text);
          if (!recipients.length) {
            await showMain(ctx, "No valid emails found. Cancelled.");
            break;
          }
          await getGmailEngine().start(
            recipients,
            state.data.subject,
            state.data.body,
            {},
          );
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

  // Register the slash-command list shown in Telegram's menu.
  bot.api
    .setMyCommands([
      { command: "menu", description: "Open the control menu" },
      { command: "cancel", description: "Cancel the current step" },
    ])
    .catch(() => {});

  // Long-poll in the background; do NOT await (it never resolves while running).
  bot
    .start({
      onStart: (info) => logger.info({ username: info.username }, "Control bot started"),
    })
    .catch((err) => logger.error({ err }, "Control bot failed to start"));
}
