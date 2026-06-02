import { Router, type IRouter, type Response } from "express";
import crypto from "node:crypto";
import { and, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import {
  db,
  gwUsers,
  gwDevices,
  gwContacts,
  gwThreads,
  gwBatches,
  gwMessages,
  type GwDevice,
} from "@workspace/db";
import {
  hashPassword,
  verifyPassword,
  signToken,
  requireAuth,
  rateLimit,
  type AuthedRequest,
} from "../lib/gatewayAuth.js";
import {
  normalizePhone,
  validateBaseUrl,
  sendSms,
  testConnection,
  verifyWebhookSignature,
  parseWebhookEvent,
  logGateway,
  type GatewayCreds,
} from "../lib/smsGatewayEngine.js";

const router: IRouter = Router();

// ---------- helpers ----------

function uid(req: AuthedRequest): number {
  return req.gwUser.id;
}

function credsFor(device: GwDevice): GatewayCreds | null {
  if (!device.smsgateLogin || !device.smsgatePassword) return null;
  return {
    baseUrl: device.smsgateBaseUrl,
    login: device.smsgateLogin,
    password: device.smsgatePassword,
  };
}

function publicDevice(d: GwDevice) {
  const { smsgatePassword, webhookSecret, ...rest } = d;
  return {
    ...rest,
    hasCredentials: Boolean(d.smsgateLogin && d.smsgatePassword),
    hasWebhookSecret: Boolean(webhookSecret),
    webhookUrl: `/api/gateway/webhook/${d.webhookToken}`,
  };
}

async function upsertThread(
  userId: number,
  phone: string,
  opts: {
    name?: string | null;
    preview: string;
    direction: "inbound" | "outbound";
    at: Date;
    incUnread?: boolean;
  },
): Promise<number> {
  const rows = await db
    .insert(gwThreads)
    .values({
      userId,
      contactPhone: phone,
      contactName: opts.name ?? null,
      lastMessageAt: opts.at,
      lastMessagePreview: opts.preview.slice(0, 160),
      lastDirection: opts.direction,
      unreadCount: opts.incUnread ? 1 : 0,
    })
    .onConflictDoUpdate({
      target: [gwThreads.userId, gwThreads.contactPhone],
      set: {
        lastMessageAt: opts.at,
        lastMessagePreview: opts.preview.slice(0, 160),
        lastDirection: opts.direction,
        ...(opts.name ? { contactName: opts.name } : {}),
        ...(opts.incUnread
          ? { unreadCount: sql`${gwThreads.unreadCount} + 1` }
          : {}),
      },
    })
    .returning({ id: gwThreads.id });
  return rows[0]!.id;
}

// ===================================================================
// AUTH
// ===================================================================

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30 });

router.post("/gateway/auth/register", authLimiter, async (req, res) => {
  const { email, password, name } = req.body ?? {};
  if (!email || !password || String(password).length < 8) {
    return res.status(400).json({
      error: "Email and a password of at least 8 characters are required.",
    });
  }
  const normEmail = String(email).trim().toLowerCase();
  const existing = await db
    .select({ id: gwUsers.id })
    .from(gwUsers)
    .where(eq(gwUsers.email, normEmail));
  if (existing.length > 0) {
    return res.status(409).json({ error: "An account with that email already exists." });
  }
  const rows = await db
    .insert(gwUsers)
    .values({
      email: normEmail,
      passwordHash: hashPassword(String(password)),
      name: name ? String(name) : null,
    })
    .returning();
  const user = rows[0]!;
  const token = signToken({ sub: user.id, email: user.email });
  res.json({
    token,
    user: { id: user.id, email: user.email, name: user.name },
  });
});

router.post("/gateway/auth/login", authLimiter, async (req, res) => {
  const { email, password } = req.body ?? {};
  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required." });
  }
  const normEmail = String(email).trim().toLowerCase();
  const rows = await db
    .select()
    .from(gwUsers)
    .where(eq(gwUsers.email, normEmail));
  const user = rows[0];
  if (!user || !verifyPassword(String(password), user.passwordHash)) {
    return res.status(401).json({ error: "Invalid email or password." });
  }
  const token = signToken({ sub: user.id, email: user.email });
  res.json({
    token,
    user: { id: user.id, email: user.email, name: user.name },
  });
});

router.get("/gateway/auth/me", requireAuth, async (req, res) => {
  const id = uid(req as AuthedRequest);
  const rows = await db.select().from(gwUsers).where(eq(gwUsers.id, id));
  const user = rows[0];
  if (!user) return res.status(404).json({ error: "User not found." });
  res.json({ id: user.id, email: user.email, name: user.name });
});

// ===================================================================
// DEVICES
// ===================================================================

router.get("/gateway/devices", requireAuth, async (req, res) => {
  const id = uid(req as AuthedRequest);
  const rows = await db
    .select()
    .from(gwDevices)
    .where(eq(gwDevices.userId, id))
    .orderBy(desc(gwDevices.createdAt));
  res.json(rows.map(publicDevice));
});

router.post("/gateway/devices", requireAuth, async (req, res) => {
  const userId = uid(req as AuthedRequest);
  const { name, phoneNumber, smsgateBaseUrl, smsgateLogin, smsgatePassword, webhookSecret } =
    req.body ?? {};
  if (!name) return res.status(400).json({ error: "Device name is required." });
  let safeBaseUrl: string | undefined;
  if (smsgateBaseUrl) {
    try {
      safeBaseUrl = validateBaseUrl(String(smsgateBaseUrl));
    } catch (err) {
      return res.status(400).json({ error: (err as Error).message });
    }
  }
  const rows = await db
    .insert(gwDevices)
    .values({
      userId,
      name: String(name),
      phoneNumber: phoneNumber ? normalizePhone(String(phoneNumber)) : null,
      ...(safeBaseUrl ? { smsgateBaseUrl: safeBaseUrl } : {}),
      smsgateLogin: smsgateLogin ? String(smsgateLogin) : null,
      smsgatePassword: smsgatePassword ? String(smsgatePassword) : null,
      webhookSecret: webhookSecret ? String(webhookSecret) : null,
      webhookToken: crypto.randomBytes(24).toString("base64url"),
    })
    .returning();
  res.json(publicDevice(rows[0]!));
});

router.patch("/gateway/devices/:id", requireAuth, async (req, res) => {
  const userId = uid(req as AuthedRequest);
  const deviceId = Number(req.params.id);
  const { name, phoneNumber, smsgateBaseUrl, smsgateLogin, smsgatePassword, webhookSecret } =
    req.body ?? {};
  const set: Record<string, unknown> = {};
  if (name !== undefined) set["name"] = String(name);
  if (phoneNumber !== undefined)
    set["phoneNumber"] = phoneNumber ? normalizePhone(String(phoneNumber)) : null;
  if (smsgateBaseUrl !== undefined) {
    if (smsgateBaseUrl) {
      try {
        set["smsgateBaseUrl"] = validateBaseUrl(String(smsgateBaseUrl));
      } catch (err) {
        return res.status(400).json({ error: (err as Error).message });
      }
    } else {
      set["smsgateBaseUrl"] = null;
    }
  }
  if (smsgateLogin !== undefined) set["smsgateLogin"] = smsgateLogin ? String(smsgateLogin) : null;
  if (smsgatePassword !== undefined && smsgatePassword !== "")
    set["smsgatePassword"] = String(smsgatePassword);
  if (webhookSecret !== undefined)
    set["webhookSecret"] = webhookSecret ? String(webhookSecret) : null;
  if (Object.keys(set).length === 0) {
    return res.status(400).json({ error: "Nothing to update." });
  }
  const rows = await db
    .update(gwDevices)
    .set(set)
    .where(and(eq(gwDevices.id, deviceId), eq(gwDevices.userId, userId)))
    .returning();
  if (rows.length === 0) return res.status(404).json({ error: "Device not found." });
  res.json(publicDevice(rows[0]!));
});

router.delete("/gateway/devices/:id", requireAuth, async (req, res) => {
  const userId = uid(req as AuthedRequest);
  const deviceId = Number(req.params.id);
  const rows = await db
    .delete(gwDevices)
    .where(and(eq(gwDevices.id, deviceId), eq(gwDevices.userId, userId)))
    .returning({ id: gwDevices.id });
  if (rows.length === 0) return res.status(404).json({ error: "Device not found." });
  res.json({ ok: true });
});

router.post("/gateway/devices/:id/test", requireAuth, async (req, res) => {
  const userId = uid(req as AuthedRequest);
  const deviceId = Number(req.params.id);
  const rows = await db
    .select()
    .from(gwDevices)
    .where(and(eq(gwDevices.id, deviceId), eq(gwDevices.userId, userId)));
  const device = rows[0];
  if (!device) return res.status(404).json({ error: "Device not found." });
  const creds = credsFor(device);
  if (!creds)
    return res
      .status(400)
      .json({ error: "Add the gateway login and password first." });
  const result = await testConnection(creds);
  if (result.ok) {
    await db
      .update(gwDevices)
      .set({ status: "online", lastSeenAt: new Date() })
      .where(eq(gwDevices.id, deviceId));
  }
  res.json(result);
});

// ===================================================================
// CONTACTS
// ===================================================================

router.get("/gateway/contacts", requireAuth, async (req, res) => {
  const userId = uid(req as AuthedRequest);
  const q = typeof req.query.query === "string" ? req.query.query.trim() : "";
  const where = q
    ? and(
        eq(gwContacts.userId, userId),
        or(ilike(gwContacts.name, `%${q}%`), ilike(gwContacts.phoneNumber, `%${q}%`)),
      )
    : eq(gwContacts.userId, userId);
  const rows = await db
    .select()
    .from(gwContacts)
    .where(where)
    .orderBy(gwContacts.name);
  res.json(rows);
});

router.post("/gateway/contacts", requireAuth, async (req, res) => {
  const userId = uid(req as AuthedRequest);
  const { name, phoneNumber, notes } = req.body ?? {};
  const phone = normalizePhone(String(phoneNumber ?? ""));
  if (!phone) return res.status(400).json({ error: "A phone number is required." });
  const rows = await db
    .insert(gwContacts)
    .values({ userId, name: name ? String(name) : null, phoneNumber: phone, notes: notes ?? null })
    .onConflictDoUpdate({
      target: [gwContacts.userId, gwContacts.phoneNumber],
      set: { name: name ? String(name) : null, notes: notes ?? null },
    })
    .returning();
  res.json(rows[0]);
});

router.patch("/gateway/contacts/:id", requireAuth, async (req, res) => {
  const userId = uid(req as AuthedRequest);
  const id = Number(req.params.id);
  const { name, phoneNumber, notes } = req.body ?? {};
  const set: Record<string, unknown> = {};
  if (name !== undefined) set["name"] = name ? String(name) : null;
  if (phoneNumber !== undefined) set["phoneNumber"] = normalizePhone(String(phoneNumber));
  if (notes !== undefined) set["notes"] = notes ? String(notes) : null;
  const rows = await db
    .update(gwContacts)
    .set(set)
    .where(and(eq(gwContacts.id, id), eq(gwContacts.userId, userId)))
    .returning();
  if (rows.length === 0) return res.status(404).json({ error: "Contact not found." });
  res.json(rows[0]);
});

router.delete("/gateway/contacts/:id", requireAuth, async (req, res) => {
  const userId = uid(req as AuthedRequest);
  const id = Number(req.params.id);
  const rows = await db
    .delete(gwContacts)
    .where(and(eq(gwContacts.id, id), eq(gwContacts.userId, userId)))
    .returning({ id: gwContacts.id });
  if (rows.length === 0) return res.status(404).json({ error: "Contact not found." });
  res.json({ ok: true });
});

// ===================================================================
// THREADS + MESSAGES
// ===================================================================

router.get("/gateway/threads", requireAuth, async (req, res) => {
  const userId = uid(req as AuthedRequest);
  const rows = await db
    .select()
    .from(gwThreads)
    .where(eq(gwThreads.userId, userId))
    .orderBy(desc(gwThreads.lastMessageAt));
  res.json(rows);
});

router.get("/gateway/threads/:id/messages", requireAuth, async (req, res) => {
  const userId = uid(req as AuthedRequest);
  const threadId = Number(req.params.id);
  const owns = await db
    .select({ id: gwThreads.id })
    .from(gwThreads)
    .where(and(eq(gwThreads.id, threadId), eq(gwThreads.userId, userId)));
  if (owns.length === 0) return res.status(404).json({ error: "Thread not found." });
  const rows = await db
    .select()
    .from(gwMessages)
    .where(eq(gwMessages.threadId, threadId))
    .orderBy(gwMessages.createdAt);
  res.json(rows);
});

router.post("/gateway/threads/:id/read", requireAuth, async (req, res) => {
  const userId = uid(req as AuthedRequest);
  const threadId = Number(req.params.id);
  await db
    .update(gwThreads)
    .set({ unreadCount: 0 })
    .where(and(eq(gwThreads.id, threadId), eq(gwThreads.userId, userId)));
  res.json({ ok: true });
});

// ===================================================================
// SENDING
// ===================================================================

async function loadDevice(userId: number, deviceId: number): Promise<GwDevice | null> {
  const rows = await db
    .select()
    .from(gwDevices)
    .where(and(eq(gwDevices.id, deviceId), eq(gwDevices.userId, userId)));
  return rows[0] ?? null;
}

router.post("/gateway/send", requireAuth, async (req, res) => {
  const userId = uid(req as AuthedRequest);
  const { deviceId, to, body } = req.body ?? {};
  const phone = normalizePhone(String(to ?? ""));
  const text = String(body ?? "").trim();
  if (!deviceId || !phone || !text) {
    return res.status(400).json({ error: "deviceId, recipient, and message are required." });
  }
  const device = await loadDevice(userId, Number(deviceId));
  if (!device) return res.status(404).json({ error: "Device not found." });
  const creds = credsFor(device);
  if (!creds) return res.status(400).json({ error: "This device has no gateway credentials." });

  const now = new Date();
  const threadId = await upsertThread(userId, phone, {
    name: device.phoneNumber ? null : null,
    preview: text,
    direction: "outbound",
    at: now,
  });
  const inserted = await db
    .insert(gwMessages)
    .values({
      userId,
      threadId,
      deviceId: device.id,
      direction: "outbound",
      peerPhone: phone,
      body: text,
      status: "queued",
    })
    .returning();
  const message = inserted[0]!;

  try {
    const result = await sendSms(creds, [phone], text);
    const updated = await db
      .update(gwMessages)
      .set({
        status: "sent",
        sentAt: new Date(),
        providerMessageId: result.id,
      })
      .where(eq(gwMessages.id, message.id))
      .returning();
    res.json(updated[0]);
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : "Send failed.";
    const updated = await db
      .update(gwMessages)
      .set({ status: "failed", error: errMsg })
      .where(eq(gwMessages.id, message.id))
      .returning();
    res.status(502).json({ ...updated[0], error: errMsg });
  }
});

interface BatchRecipient {
  phone: string;
  name?: string | null;
}

async function processBatch(
  userId: number,
  device: GwDevice,
  creds: GatewayCreds,
  batchId: number,
  recipients: BatchRecipient[],
  template: string,
): Promise<void> {
  let sent = 0;
  let failed = 0;
  for (const r of recipients) {
    const text = template.replace(/\{name\}/g, r.name ?? "").trim();
    const now = new Date();
    const threadId = await upsertThread(userId, r.phone, {
      name: r.name ?? null,
      preview: text,
      direction: "outbound",
      at: now,
    });
    const inserted = await db
      .insert(gwMessages)
      .values({
        userId,
        threadId,
        deviceId: device.id,
        batchId,
        direction: "outbound",
        peerPhone: r.phone,
        body: text,
        status: "queued",
      })
      .returning();
    const messageId = inserted[0]!.id;
    try {
      const result = await sendSms(creds, [r.phone], text);
      await db
        .update(gwMessages)
        .set({ status: "sent", sentAt: new Date(), providerMessageId: result.id })
        .where(eq(gwMessages.id, messageId));
      sent++;
    } catch (e) {
      failed++;
      await db
        .update(gwMessages)
        .set({ status: "failed", error: e instanceof Error ? e.message : "Send failed." })
        .where(eq(gwMessages.id, messageId));
    }
    await db
      .update(gwBatches)
      .set({ sent, failed })
      .where(eq(gwBatches.id, batchId));
    // gentle pacing to avoid overwhelming the phone / carrier
    await new Promise((resolve) => setTimeout(resolve, 800));
  }
  await db
    .update(gwBatches)
    .set({ sent, failed, status: failed === recipients.length ? "failed" : "done" })
    .where(eq(gwBatches.id, batchId));
}

router.post("/gateway/batch", requireAuth, async (req, res) => {
  const userId = uid(req as AuthedRequest);
  const { deviceId, name, body, recipients, contactIds } = req.body ?? {};
  const text = String(body ?? "").trim();
  if (!deviceId || !text) {
    return res.status(400).json({ error: "deviceId and message are required." });
  }
  const device = await loadDevice(userId, Number(deviceId));
  if (!device) return res.status(404).json({ error: "Device not found." });
  const creds = credsFor(device);
  if (!creds) return res.status(400).json({ error: "This device has no gateway credentials." });

  const list: BatchRecipient[] = [];
  if (Array.isArray(recipients) && recipients.length > 0) {
    for (const r of recipients as { phone?: string; phoneNumber?: string; name?: string }[]) {
      const phone = normalizePhone(String(r.phone ?? r.phoneNumber ?? ""));
      if (phone) list.push({ phone, name: r.name ?? null });
    }
  }
  if (Array.isArray(contactIds) && contactIds.length > 0) {
    const ids = contactIds.map((x: unknown) => Number(x)).filter((n) => !Number.isNaN(n));
    if (ids.length > 0) {
      const contacts = await db
        .select()
        .from(gwContacts)
        .where(and(eq(gwContacts.userId, userId), inArray(gwContacts.id, ids)));
      for (const c of contacts) list.push({ phone: c.phoneNumber, name: c.name });
    }
  }
  // De-duplicate by phone so a number selected twice is only messaged once.
  const seen = new Set<string>();
  const deduped = list.filter((r) => (seen.has(r.phone) ? false : (seen.add(r.phone), true)));
  if (deduped.length === 0) {
    return res.status(400).json({ error: "No valid recipients provided." });
  }

  const batchRows = await db
    .insert(gwBatches)
    .values({
      userId,
      name: name ? String(name) : null,
      bodyTemplate: text,
      total: deduped.length,
      status: "running",
    })
    .returning();
  const batch = batchRows[0]!;

  // Fire and forget — dashboard polls batch status.
  void processBatch(userId, device, creds, batch.id, deduped, text).catch((e) => {
    logGateway("batch processing error", { error: String(e), batchId: batch.id });
  });

  res.json(batch);
});

router.get("/gateway/batches", requireAuth, async (req, res) => {
  const userId = uid(req as AuthedRequest);
  const rows = await db
    .select()
    .from(gwBatches)
    .where(eq(gwBatches.userId, userId))
    .orderBy(desc(gwBatches.createdAt))
    .limit(50);
  res.json(rows);
});

// ===================================================================
// SEARCH + OVERVIEW
// ===================================================================

router.get("/gateway/search", requireAuth, async (req, res) => {
  const userId = uid(req as AuthedRequest);
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  if (!q) return res.json([]);
  const rows = await db
    .select({
      id: gwMessages.id,
      threadId: gwMessages.threadId,
      direction: gwMessages.direction,
      peerPhone: gwMessages.peerPhone,
      body: gwMessages.body,
      status: gwMessages.status,
      createdAt: gwMessages.createdAt,
    })
    .from(gwMessages)
    .where(and(eq(gwMessages.userId, userId), ilike(gwMessages.body, `%${q}%`)))
    .orderBy(desc(gwMessages.createdAt))
    .limit(100);
  res.json(rows);
});

router.get("/gateway/overview", requireAuth, async (req, res) => {
  const userId = uid(req as AuthedRequest);
  const [threadCount] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(gwThreads)
    .where(eq(gwThreads.userId, userId));
  const [contactCount] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(gwContacts)
    .where(eq(gwContacts.userId, userId));
  const [deviceCount] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(gwDevices)
    .where(eq(gwDevices.userId, userId));
  const [unread] = await db
    .select({ n: sql<number>`coalesce(sum(unread_count),0)::int` })
    .from(gwThreads)
    .where(eq(gwThreads.userId, userId));
  const [sentCount] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(gwMessages)
    .where(and(eq(gwMessages.userId, userId), eq(gwMessages.direction, "outbound")));
  const [recvCount] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(gwMessages)
    .where(and(eq(gwMessages.userId, userId), eq(gwMessages.direction, "inbound")));
  res.json({
    threads: threadCount?.n ?? 0,
    contacts: contactCount?.n ?? 0,
    devices: deviceCount?.n ?? 0,
    unread: unread?.n ?? 0,
    sent: sentCount?.n ?? 0,
    received: recvCount?.n ?? 0,
  });
});

// ===================================================================
// INBOUND WEBHOOK (no JWT — protected by unguessable token + optional HMAC)
// ===================================================================

async function handleWebhook(req: AuthedRequest | any, res: Response): Promise<void> {
  const token = String(req.params.token ?? "");
  const rows = await db.select().from(gwDevices).where(eq(gwDevices.webhookToken, token));
  const device = rows[0];
  if (!device) {
    res.status(404).json({ error: "Unknown webhook." });
    return;
  }

  // Optional HMAC verification when a secret is configured.
  if (device.webhookSecret) {
    const sigHeader =
      (req.headers["x-signature"] as string) ||
      (req.headers["x-hub-signature-256"] as string) ||
      "";
    const rawBody =
      (req as unknown as { rawBody?: string }).rawBody ?? JSON.stringify(req.body ?? {});
    if (!verifyWebhookSignature(device.webhookSecret, rawBody, sigHeader)) {
      res.status(401).json({ error: "Bad signature." });
      return;
    }
  }

  const parsed = parseWebhookEvent(req.body);
  const now = new Date();
  await db
    .update(gwDevices)
    .set({ status: "online", lastSeenAt: now })
    .where(eq(gwDevices.id, device.id));

  if (parsed.event === "sms:received" && parsed.phoneNumber) {
    const phone = normalizePhone(parsed.phoneNumber);
    const text = parsed.message ?? "";
    const threadId = await upsertThread(device.userId, phone, {
      preview: text,
      direction: "inbound",
      at: now,
      incUnread: true,
    });
    await db.insert(gwMessages).values({
      userId: device.userId,
      threadId,
      deviceId: device.id,
      direction: "inbound",
      peerPhone: phone,
      body: text,
      status: "received",
    });
    logGateway("inbound message stored", { deviceId: device.id, phone });
  } else if (
    parsed.event === "sms:sent" ||
    parsed.event === "sms:delivered" ||
    parsed.event === "sms:failed"
  ) {
    const statusMap: Record<string, string> = {
      "sms:sent": "sent",
      "sms:delivered": "delivered",
      "sms:failed": "failed",
    };
    const newStatus = statusMap[parsed.event]!;
    const patch: Record<string, unknown> = { status: newStatus };
    if (parsed.event === "sms:delivered") patch["deliveredAt"] = now;
    if (parsed.event === "sms:sent") patch["sentAt"] = now;
    if (parsed.messageId) {
      await db
        .update(gwMessages)
        .set(patch)
        .where(
          and(
            eq(gwMessages.userId, device.userId),
            eq(gwMessages.providerMessageId, parsed.messageId),
          ),
        );
    }
    logGateway("status update", { event: parsed.event, messageId: parsed.messageId });
  }

  res.json({ ok: true });
}

router.post("/gateway/webhook/:token", (req, res) => {
  void handleWebhook(req, res).catch((e) => {
    logGateway("webhook error", { error: String(e) });
    if (!res.headersSent) res.status(200).json({ ok: true });
  });
});

export default router;
