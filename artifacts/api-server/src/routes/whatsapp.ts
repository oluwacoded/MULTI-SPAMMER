import { Router } from "express";
import { getWhatsAppEngine } from "../lib/whatsappEngine.js";
import { csvRow } from "../lib/csv.js";

const router = Router();

router.get("/whatsapp/status", (_req, res) => {
  res.json(getWhatsAppEngine().getStatus());
});

router.post("/whatsapp/connect", async (req, res) => {
  try {
    const fresh = req.body?.fresh === true || req.body?.fresh === "true";
    await getWhatsAppEngine().connect({ fresh });
    res.json({ ok: true, message: "Connecting — scan the QR code" });
  } catch (e: any) {
    res.json({ ok: false, message: e.message });
  }
});

router.post("/whatsapp/logout", async (_req, res) => {
  await getWhatsAppEngine().logout();
  res.json({ ok: true, message: "Logged out" });
});

// Request a pairing code to link WhatsApp by phone number (no QR scan).
router.post("/whatsapp/pair", async (req, res) => {
  const { phone } = req.body;
  if (!phone) return res.status(400).json({ ok: false, message: "phone required" });
  try {
    const code = await getWhatsAppEngine().requestPairingCode(String(phone));
    res.json({ ok: true, code });
  } catch (e: any) {
    res.json({ ok: false, message: e.message });
  }
});

router.get("/whatsapp/campaign/status", (_req, res) => {
  res.json(getWhatsAppEngine().getCampaignStatus());
});

router.post("/whatsapp/campaign/start", async (req, res) => {
  const { contacts, message, minDelay, maxDelay } = req.body;
  if (!contacts?.length || !message) {
    return res.status(400).json({ ok: false, message: "contacts and message required" });
  }
  try {
    await getWhatsAppEngine().startCampaign(contacts, message, { minDelay, maxDelay });
    res.json({ ok: true, message: "WhatsApp campaign started" });
  } catch (e: any) {
    res.json({ ok: false, message: e.message });
  }
});

router.post("/whatsapp/campaign/stop", (_req, res) => {
  getWhatsAppEngine().stopCampaign();
  res.json({ ok: true, message: "Stopped" });
});

router.get("/whatsapp/history", (_req, res) => {
  res.json({ items: getWhatsAppEngine().getHistory() });
});

router.get("/whatsapp/history/:id", (req, res) => {
  const data = getWhatsAppEngine().getHistoryItem(req.params.id);
  if (!data) return res.status(404).json({ ok: false, message: "Not found" });
  res.json(data);
});

router.get("/whatsapp/history/:id/export.csv", (req, res) => {
  const data = getWhatsAppEngine().getHistoryItem(req.params.id);
  if (!data) return res.status(404).json({ ok: false, message: "Not found" });
  const rows = ["phone,name,status,error,timestamp"];
  for (const e of (data.log || [])) {
    const ts = e.at ? new Date(e.at).toISOString() : "";
    rows.push(csvRow([e.phone, e.name || "", e.status, e.error || "", ts]));
  }
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename="whatsapp-campaign-${req.params.id}.csv"`);
  res.send(rows.join("\n"));
});

router.delete("/whatsapp/history/:id", (req, res) => {
  res.json({ ok: getWhatsAppEngine().deleteHistory(req.params.id) });
});

export default router;
