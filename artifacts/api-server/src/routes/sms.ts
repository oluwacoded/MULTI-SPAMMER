import { Router } from "express";
import { getSmsEngine } from "../lib/smsEngine.js";

const router = Router();

router.get("/sms/status", (req, res) => {
  const sms = getSmsEngine();
  res.json(sms.getStatus());
});

router.post("/sms/start", async (req, res) => {
  const sms = getSmsEngine();
  const { contacts, message, provider, senderId } = req.body;
  if (!contacts?.length || !message) {
    return res.status(400).json({ ok: false, message: "contacts and message required" });
  }
  try {
    await sms.startCampaign({ contacts, message, provider, senderId });
    res.json({ ok: true, message: "SMS campaign started" });
  } catch (e: any) {
    res.json({ ok: false, message: e.message });
  }
});

router.post("/sms/stop", (req, res) => {
  const sms = getSmsEngine();
  sms.stopCampaign();
  res.json({ ok: true, message: "SMS campaign stopped" });
});

router.post("/sms/flash", async (req, res) => {
  const sms = getSmsEngine();
  const { phone, message, provider, senderId } = req.body;
  if (!phone || !message) {
    return res.status(400).json({ ok: false, message: "phone and message required" });
  }
  const result = await sms.sendOne({ phone, message, provider, senderId });
  res.json(result);
});

router.get("/sms/providers", async (req, res) => {
  const sms = getSmsEngine();
  res.json(await sms.getProviders());
});

router.get("/sms/history", (req, res) => {
  const sms = getSmsEngine();
  res.json({ items: sms.getHistory() });
});

export default router;
