import { Router } from "express";
import { getGmailEngine } from "../lib/gmailEngine.js";
import { csvRow } from "../lib/csv.js";

const router = Router();

// ─── Config ───────────────────────────────────────────────────────────────────
router.get("/gmail/config", (_req, res) => {
  res.json(getGmailEngine().publicConfig());
});

router.post("/gmail/config", async (req, res) => {
  const engine = getGmailEngine();
  const { email, appPassword, fromName } = req.body;
  try {
    engine.setConfig({ email, appPassword, fromName });
    const verify = await engine.verify();
    res.json({ ok: verify.ok, message: verify.ok ? "Saved & verified" : `Saved, but verification failed: ${verify.message}` });
  } catch (e: any) {
    res.json({ ok: false, message: e.message });
  }
});

router.post("/gmail/test", async (req, res) => {
  const { to, subject, html } = req.body;
  if (!to || !html) return res.status(400).json({ ok: false, message: "to and html required" });
  const result = await getGmailEngine().sendTest(to, subject || "Test email", html);
  res.json(result);
});

// ─── Templates ──────────────────────────────────────────────────────────────
router.get("/gmail/templates", (_req, res) => {
  res.json({ templates: getGmailEngine().getTemplates() });
});

router.post("/gmail/templates", (req, res) => {
  const { name, design, html } = req.body;
  if (!name || !html) return res.status(400).json({ ok: false, message: "name and html required" });
  const item = getGmailEngine().saveTemplate(name, design || null, html);
  res.json({ ok: true, item });
});

router.delete("/gmail/templates/:id", (req, res) => {
  getGmailEngine().deleteTemplate(req.params.id);
  res.json({ ok: true });
});

// ─── Campaign ─────────────────────────────────────────────────────────────────
router.get("/gmail/campaign/status", (_req, res) => {
  res.json(getGmailEngine().getStatus());
});

router.post("/gmail/campaign/start", async (req, res) => {
  const { contacts, subject, html, minDelay, maxDelay } = req.body;
  if (!contacts?.length || !subject || !html) {
    return res.status(400).json({ ok: false, message: "contacts, subject and html required" });
  }
  try {
    await getGmailEngine().start(contacts, subject, html, { minDelay, maxDelay });
    res.json({ ok: true, message: "Email campaign started" });
  } catch (e: any) {
    res.json({ ok: false, message: e.message });
  }
});

router.post("/gmail/campaign/stop", (_req, res) => {
  getGmailEngine().stop();
  res.json({ ok: true, message: "Stopped" });
});

// ─── History ──────────────────────────────────────────────────────────────────
router.get("/gmail/history", (_req, res) => {
  res.json({ items: getGmailEngine().getHistory() });
});

router.get("/gmail/history/:id", (req, res) => {
  const data = getGmailEngine().getHistoryItem(req.params.id);
  if (!data) return res.status(404).json({ ok: false, message: "Not found" });
  res.json(data);
});

router.get("/gmail/history/:id/export.csv", (req, res) => {
  const data = getGmailEngine().getHistoryItem(req.params.id);
  if (!data) return res.status(404).json({ ok: false, message: "Not found" });
  const rows = ["email,name,status,error,timestamp"];
  for (const e of (data.log || [])) {
    const ts = e.at ? new Date(e.at).toISOString() : "";
    rows.push(csvRow([e.email, e.name || "", e.status, e.error || "", ts]));
  }
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename="email-campaign-${req.params.id}.csv"`);
  res.send(rows.join("\n"));
});

router.delete("/gmail/history/:id", (req, res) => {
  res.json({ ok: getGmailEngine().deleteHistory(req.params.id) });
});

export default router;
