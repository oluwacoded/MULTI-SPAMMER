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
  const { contacts, message, minDelay, maxDelay, batchSize, batchPauseMin, typingDelay, autoVariation, dailyLimit } = req.body;
  if (!contacts?.length || !message) {
    return res.status(400).json({ ok: false, message: "contacts and message required" });
  }
  try {
    await bot.startCampaignFromAPI(contacts, message, {
      minDelay, maxDelay, batchSize, batchPauseMin, typingDelay, autoVariation, dailyLimit
    });
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

// US phone number scraper / generator
router.get("/scrape/us-phones", async (req, res) => {
  const count = Math.min(parseInt(req.query.count as string) || 50, 500);
  try {
    const resp = await fetch("https://www.coolgenerator.com/us-phone-number-generator", {
      signal: AbortSignal.timeout(8000),
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5"
      }
    });
    const html = await resp.text();
    const raw = html.match(/\(?\d{3}\)?[\s.\-]?\d{3}[\s.\-]?\d{4}/g) || [];
    const phones = [...new Set(raw)]
      .map(p => {
        const digits = p.replace(/\D/g, "");
        if (digits.length === 10) return "+1" + digits;
        if (digits.length === 11 && digits[0] === "1") return "+" + digits;
        return null;
      })
      .filter((p): p is string => !!p)
      .slice(0, count);

    if (phones.length >= 5) {
      return res.json({ phones, source: "coolgenerator.com", count: phones.length });
    }
  } catch (err) {
    console.log("[Scrape] Fetch failed, generating locally:", err);
  }

  // Fallback: generate valid US numbers locally
  const areaCodes = ["201","202","212","213","214","215","216","217","305","310","312","313","323",
    "347","404","407","408","415","424","469","503","512","602","612","617","619",
    "702","713","714","716","720","803","818","845","904","916","917","919","929"];
  const phones: string[] = [];
  for (let i = 0; i < count; i++) {
    const area = areaCodes[Math.floor(Math.random() * areaCodes.length)];
    const d2 = String(Math.floor(Math.random() * 8) + 2);
    const d3 = String(Math.floor(Math.random() * 10));
    const d4 = String(Math.floor(Math.random() * 10));
    const sub = String(Math.floor(Math.random() * 9000) + 1000);
    phones.push(`+1${area}${d2}${d3}${d4}${sub}`);
  }
  res.json({ phones, source: "generated", count: phones.length });
});

export default router;
