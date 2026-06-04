import { Router } from "express";
import { randomUUID } from "crypto";
import {
  readJson, writeJson, listSubdir, readSubdirItem, writeSubdirItem, deleteSubdirItem
} from "../lib/dataStore.js";

const router = Router();

// ─── Contact Lists ────────────────────────────────────────────────────────────

router.get("/contact-lists", (_req, res) => {
  const files = listSubdir("contact-lists");
  const lists = files.map(f => {
    const id = f.replace(".json", "");
    const data = readSubdirItem<any>("contact-lists", id, null);
    if (!data) return null;
    return { id, name: data.name, count: data.contacts?.length || 0, createdAt: data.createdAt };
  }).filter(Boolean);
  res.json({ lists });
});

router.post("/contact-lists", (req, res) => {
  const { name, contacts } = req.body;
  if (!name || !contacts?.length) return res.status(400).json({ ok: false, message: "name and contacts required" });
  const id = randomUUID();
  writeSubdirItem("contact-lists", id, { id, name, contacts, createdAt: Date.now() });
  res.json({ ok: true, id });
});

router.get("/contact-lists/:id", (req, res) => {
  const data = readSubdirItem<any>("contact-lists", req.params.id, null);
  if (!data) return res.status(404).json({ ok: false, message: "Not found" });
  res.json(data);
});

router.delete("/contact-lists/:id", (req, res) => {
  const ok = deleteSubdirItem("contact-lists", req.params.id);
  res.json({ ok });
});

// ─── Message Templates ────────────────────────────────────────────────────────

router.get("/templates", (_req, res) => {
  const templates = readJson<any[]>("templates.json", []);
  res.json({ templates });
});

router.post("/templates", (req, res) => {
  const { name, message } = req.body;
  if (!name || !message) return res.status(400).json({ ok: false, message: "name and message required" });
  const templates = readJson<any[]>("templates.json", []);
  const item = { id: randomUUID(), name, message, createdAt: Date.now() };
  templates.push(item);
  writeJson("templates.json", templates);
  res.json({ ok: true, item });
});

router.put("/templates/:id", (req, res) => {
  const templates = readJson<any[]>("templates.json", []);
  const idx = templates.findIndex(t => t.id === req.params.id);
  if (idx === -1) return res.status(404).json({ ok: false, message: "Not found" });
  templates[idx] = { ...templates[idx], ...req.body, id: req.params.id };
  writeJson("templates.json", templates);
  res.json({ ok: true });
});

router.delete("/templates/:id", (req, res) => {
  const templates = readJson<any[]>("templates.json", []);
  const filtered = templates.filter(t => t.id !== req.params.id);
  writeJson("templates.json", filtered);
  res.json({ ok: true });
});

// ─── Blacklist ────────────────────────────────────────────────────────────────

router.get("/blacklist", (_req, res) => {
  const phones = readJson<string[]>("blacklist.json", []);
  res.json({ phones, count: phones.length });
});

router.post("/blacklist", (req, res) => {
  const { phone } = req.body;
  if (!phone) return res.status(400).json({ ok: false, message: "phone required" });
  const bl = new Set(readJson<string[]>("blacklist.json", []));
  bl.add(phone.replace(/\s/g, ""));
  writeJson("blacklist.json", [...bl]);
  res.json({ ok: true, count: bl.size });
});

router.post("/blacklist/bulk", (req, res) => {
  const { phones } = req.body;
  if (!phones?.length) return res.status(400).json({ ok: false, message: "phones array required" });
  const bl = new Set(readJson<string[]>("blacklist.json", []));
  for (const p of phones) bl.add(String(p).replace(/\s/g, ""));
  writeJson("blacklist.json", [...bl]);
  res.json({ ok: true, count: bl.size });
});

router.delete("/blacklist/:phone", (req, res) => {
  const target = decodeURIComponent(req.params.phone);
  const bl = readJson<string[]>("blacklist.json", []).filter(p => p !== target);
  writeJson("blacklist.json", bl);
  res.json({ ok: true, count: bl.length });
});

router.delete("/blacklist", (_req, res) => {
  writeJson("blacklist.json", []);
  res.json({ ok: true });
});

// ─── Campaign History ─────────────────────────────────────────────────────────

router.get("/campaign/history", (_req, res) => {
  const files = listSubdir("campaign-history");
  const items = files.slice(0, 100).map(f => {
    const id = f.replace(".json", "");
    const data = readSubdirItem<any>("campaign-history", id, null);
    if (!data) return null;
    return {
      id: data.id,
      startTime: data.startTime,
      endTime: data.endTime,
      total: data.total,
      sent: data.sent,
      failed: data.failed,
      noTelegram: data.noTelegram,
      skipped: data.skipped || 0,
      message: data.message
    };
  }).filter(Boolean);
  res.json({ items });
});

router.get("/campaign/history/:id", (req, res) => {
  const data = readSubdirItem<any>("campaign-history", req.params.id, null);
  if (!data) return res.status(404).json({ ok: false, message: "Not found" });
  res.json(data);
});

router.get("/campaign/history/:id/export.csv", (req, res) => {
  const data = readSubdirItem<any>("campaign-history", req.params.id, null);
  if (!data) return res.status(404).json({ ok: false, message: "Not found" });
  const rows = ["phone,name,status,error,timestamp"];
  for (const e of (data.log || [])) {
    const ts = e.at ? new Date(e.at).toISOString() : "";
    const err = (e.error || "").replace(/"/g, '""');
    rows.push(`"${e.phone}","${e.name || ""}","${e.status}","${err}","${ts}"`);
  }
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename="campaign-${req.params.id}.csv"`);
  res.send(rows.join("\n"));
});

router.delete("/campaign/history/:id", (req, res) => {
  const ok = deleteSubdirItem("campaign-history", req.params.id);
  res.json({ ok });
});

export default router;
