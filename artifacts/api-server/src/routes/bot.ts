import { Router } from "express";
import { getBotInstance } from "../lib/botInstance.js";

const router = Router();

router.get("/bot/status", (req, res) => {
  const bot = getBotInstance();
  res.json(bot.getStatus());
});

router.post("/bot/disconnect", async (req, res) => {
  const bot = getBotInstance();
  await bot.disconnect();
  res.json({ ok: true, message: "Disconnected" });
});

router.post("/login/start", async (req, res) => {
  const bot = getBotInstance();
  const { phone } = req.body;
  if (!phone) return res.status(400).json({ ok: false, message: "phone required" });
  try {
    await bot.startLogin(phone);
    res.json({ ok: true, message: "Code sent — check Telegram" });
  } catch (e: any) {
    res.json({ ok: false, message: e.message });
  }
});

router.post("/login/code", async (req, res) => {
  const bot = getBotInstance();
  const { code } = req.body;
  if (!code) return res.status(400).json({ ok: false, message: "code required" });
  try {
    bot.submitCode(code);
    res.json({ ok: true, message: "Code submitted" });
  } catch (e: any) {
    res.json({ ok: false, message: e.message });
  }
});

router.post("/login/2fa", async (req, res) => {
  const bot = getBotInstance();
  const { password } = req.body;
  if (!password) return res.status(400).json({ ok: false, message: "password required" });
  try {
    bot.submit2FA(password);
    res.json({ ok: true, message: "2FA submitted" });
  } catch (e: any) {
    res.json({ ok: false, message: e.message });
  }
});

router.get("/campaign/status", (req, res) => {
  const bot = getBotInstance();
  res.json(bot.getCampaignStatus());
});

router.post("/campaign/start", async (req, res) => {
  const bot = getBotInstance();
  const { contacts, message } = req.body;
  if (!contacts?.length || !message) {
    return res.status(400).json({ ok: false, message: "contacts and message required" });
  }
  try {
    await bot.startCampaignFromAPI(contacts, message);
    res.json({ ok: true, message: "Campaign started" });
  } catch (e: any) {
    res.json({ ok: false, message: e.message });
  }
});

router.post("/campaign/stop", (req, res) => {
  const bot = getBotInstance();
  bot.stopCampaign();
  res.json({ ok: true, message: "Campaign stopped" });
});

router.get("/settings", (req, res) => {
  const bot = getBotInstance();
  res.json(bot.getSettings());
});

router.post("/settings", (req, res) => {
  const bot = getBotInstance();
  bot.updateSettings(req.body);
  res.json(bot.getSettings());
});

router.get("/wallet/:userId", (req, res) => {
  const bot = getBotInstance();
  res.json(bot.getWallet(req.params.userId));
});

router.post("/wallet/topup", (req, res) => {
  const bot = getBotInstance();
  const { userId, amount, note } = req.body;
  if (!userId || !amount) return res.status(400).json({ ok: false, message: "userId and amount required" });
  bot.walletCredit(userId, amount, note || "manual topup");
  res.json({ ok: true, message: `Credited ${amount}` });
});

router.get("/scam/log", (req, res) => {
  const bot = getBotInstance();
  res.json({ alerts: bot.getScamAlerts() });
});

export default router;
