import { Router, type IRouter, type Request, type Response } from "express";
import { eq, and, desc } from "drizzle-orm";
import {
  db,
  smmpUsers,
  smmpOrders,
  smmpTransactions,
  type SmmpUser,
} from "@workspace/db";
import {
  hashPassword,
  verifyPassword,
  signToken,
  requireAuth,
  type SmmAuthedRequest,
} from "../lib/smmAuth.js";
import { applyMarkup, computeCharge } from "../lib/smmPricing.js";
import { smmPost } from "./smm.js";
import {
  createPayment,
  verifyTransaction,
  verifyWebhookSignature,
  isConfigured as flwConfigured,
} from "../lib/flutterwave.js";

const router: IRouter = Router();

const CURRENCY = "NGN";
const MIN_DEPOSIT = 100;

function money(n: number): string {
  return (Math.round(n * 10000) / 10000).toFixed(4);
}

function userId(req: Request): number {
  return (req as SmmAuthedRequest).smmUser.id;
}

function publicUser(u: SmmpUser) {
  return {
    id: u.id,
    email: u.email,
    name: u.name ?? null,
    balance: u.balance,
    currency: CURRENCY,
  };
}

// ---------------------------------------------------------------- auth

router.post("/smm/auth/register", async (req, res) => {
  try {
    const { email, password, name } = (req.body ?? {}) as {
      email?: string;
      password?: string;
      name?: string;
    };
    const normEmail = String(email ?? "").trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normEmail)) {
      res.status(400).json({ error: "A valid email is required" });
      return;
    }
    if (!password || password.length < 6) {
      res.status(400).json({ error: "Password must be at least 6 characters" });
      return;
    }

    const existing = await db
      .select({ id: smmpUsers.id })
      .from(smmpUsers)
      .where(eq(smmpUsers.email, normEmail));
    if (existing.length > 0) {
      res.status(409).json({ error: "An account with this email already exists" });
      return;
    }

    const [user] = await db
      .insert(smmpUsers)
      .values({
        email: normEmail,
        passwordHash: hashPassword(password),
        name: name ? String(name).trim() : null,
      })
      .returning();

    const token = signToken({ sub: user!.id, email: user!.email });
    res.json({ token, user: publicUser(user!) });
  } catch (err) {
    res.status(500).json({ error: "Registration failed", detail: String(err) });
  }
});

router.post("/smm/auth/login", async (req, res) => {
  try {
    const { email, password } = (req.body ?? {}) as {
      email?: string;
      password?: string;
    };
    const normEmail = String(email ?? "").trim().toLowerCase();
    const [user] = await db
      .select()
      .from(smmpUsers)
      .where(eq(smmpUsers.email, normEmail));
    if (!user || !verifyPassword(String(password ?? ""), user.passwordHash)) {
      res.status(401).json({ error: "Invalid email or password" });
      return;
    }
    const token = signToken({ sub: user.id, email: user.email });
    res.json({ token, user: publicUser(user) });
  } catch (err) {
    res.status(500).json({ error: "Login failed", detail: String(err) });
  }
});

router.get("/smm/auth/me", requireAuth, async (req, res) => {
  const [user] = await db
    .select()
    .from(smmpUsers)
    .where(eq(smmpUsers.id, userId(req)));
  if (!user) {
    res.status(404).json({ error: "Account not found" });
    return;
  }
  res.json({ user: publicUser(user) });
});

// ---------------------------------------------------------------- wallet

router.get("/smm/wallet", requireAuth, async (req, res) => {
  const uid = userId(req);
  const [user] = await db
    .select()
    .from(smmpUsers)
    .where(eq(smmpUsers.id, uid));
  if (!user) {
    res.status(404).json({ error: "Account not found" });
    return;
  }
  const txns = await db
    .select()
    .from(smmpTransactions)
    .where(eq(smmpTransactions.userId, uid))
    .orderBy(desc(smmpTransactions.createdAt))
    .limit(50);

  res.json({
    balance: user.balance,
    currency: CURRENCY,
    transactions: txns.map((t) => ({
      id: t.id,
      type: t.type,
      amount: t.amount,
      balanceAfter: t.balanceAfter,
      status: t.status,
      description: t.description ?? null,
      createdAt: t.createdAt.toISOString(),
    })),
  });
});

// ---------------------------------------------------------------- deposit

router.post("/smm/deposit/initiate", requireAuth, async (req, res) => {
  try {
    if (!flwConfigured()) {
      res.status(503).json({ error: "Payments are not configured yet" });
      return;
    }
    const uid = userId(req);
    const { amount, redirectUrl } = (req.body ?? {}) as {
      amount?: number;
      redirectUrl?: string;
    };
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt < MIN_DEPOSIT) {
      res.status(400).json({ error: `Minimum deposit is ${MIN_DEPOSIT} ${CURRENCY}` });
      return;
    }
    const redirect = String(redirectUrl ?? "");
    if (!/^https?:\/\//.test(redirect)) {
      res.status(400).json({ error: "A valid redirect URL is required" });
      return;
    }

    const [user] = await db
      .select()
      .from(smmpUsers)
      .where(eq(smmpUsers.id, uid));
    if (!user) {
      res.status(404).json({ error: "Account not found" });
      return;
    }

    const txRef = `smmp-${uid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    await db.insert(smmpTransactions).values({
      userId: uid,
      type: "deposit",
      amount: money(amt),
      balanceAfter: user.balance,
      status: "pending",
      reference: txRef,
      description: "Flutterwave wallet deposit",
    });

    const link = await createPayment({
      txRef,
      amount: amt,
      currency: CURRENCY,
      redirectUrl: redirect,
      email: user.email,
      name: user.name,
    });

    res.json({ link, reference: txRef });
  } catch (err) {
    res.status(502).json({ error: "Could not start payment", detail: String(err) });
  }
});

// Credits a pending deposit exactly once. Returns the resulting balance.
async function creditDeposit(
  txRef: string,
  verifiedAmount: number,
): Promise<{ credited: boolean; balance: string }> {
  return db.transaction(async (tx) => {
    const [pending] = await tx
      .select()
      .from(smmpTransactions)
      .where(eq(smmpTransactions.reference, txRef))
      .for("update");

    if (!pending) throw new Error("Deposit reference not found");
    if (pending.status === "success") {
      const [u] = await tx
        .select({ balance: smmpUsers.balance })
        .from(smmpUsers)
        .where(eq(smmpUsers.id, pending.userId));
      return { credited: false, balance: u?.balance ?? "0" };
    }

    const [u] = await tx
      .select()
      .from(smmpUsers)
      .where(eq(smmpUsers.id, pending.userId))
      .for("update");
    if (!u) throw new Error("Account not found");

    const newBalance = Number(u.balance) + verifiedAmount;
    await tx
      .update(smmpUsers)
      .set({ balance: money(newBalance) })
      .where(eq(smmpUsers.id, u.id));
    await tx
      .update(smmpTransactions)
      .set({
        status: "success",
        amount: money(verifiedAmount),
        balanceAfter: money(newBalance),
      })
      .where(eq(smmpTransactions.id, pending.id));

    return { credited: true, balance: money(newBalance) };
  });
}

router.get("/smm/deposit/verify", requireAuth, async (req, res) => {
  try {
    const uid = userId(req);
    const txRef = String(req.query.tx_ref ?? "");
    const transactionId = String(req.query.transaction_id ?? "");
    if (!txRef) {
      res.status(400).json({ error: "tx_ref is required" });
      return;
    }

    const [txn] = await db
      .select()
      .from(smmpTransactions)
      .where(eq(smmpTransactions.reference, txRef));
    if (!txn || txn.userId !== uid) {
      res.status(404).json({ error: "Deposit not found" });
      return;
    }
    if (txn.status === "success") {
      const [u] = await db
        .select({ balance: smmpUsers.balance })
        .from(smmpUsers)
        .where(eq(smmpUsers.id, uid));
      res.json({ status: "success", balance: u?.balance ?? "0" });
      return;
    }

    if (!transactionId) {
      res.status(400).json({ error: "transaction_id is required" });
      return;
    }

    const verified = await verifyTransaction(transactionId);
    if (verified.status !== "successful" || verified.txRef !== txRef) {
      await db
        .update(smmpTransactions)
        .set({ status: "failed" })
        .where(and(eq(smmpTransactions.id, txn.id), eq(smmpTransactions.status, "pending")));
      res.json({ status: "failed", balance: txn.balanceAfter });
      return;
    }

    const { balance } = await creditDeposit(txRef, verified.amount);
    res.json({ status: "success", balance });
  } catch (err) {
    res.status(502).json({ error: "Verification failed", detail: String(err) });
  }
});

router.post("/smm/deposit/webhook", async (req, res) => {
  try {
    const headerHash = req.headers["verif-hash"];
    const hash = Array.isArray(headerHash) ? headerHash[0] : headerHash;
    if (!verifyWebhookSignature(hash)) {
      res.status(401).json({ error: "Invalid signature" });
      return;
    }
    const body = (req.body ?? {}) as {
      event?: string;
      data?: { id?: number | string; tx_ref?: string; status?: string };
    };
    const txRef = String(body.data?.tx_ref ?? "");
    const txnId = body.data?.id;
    if (!txRef || txnId == null) {
      res.status(200).json({ ok: true });
      return;
    }
    const verified = await verifyTransaction(txnId);
    if (verified.status === "successful" && verified.txRef === txRef) {
      await creditDeposit(txRef, verified.amount).catch(() => undefined);
    }
    res.status(200).json({ ok: true });
  } catch {
    res.status(200).json({ ok: true });
  }
});

// ---------------------------------------------------------------- orders

interface RawService {
  service: string;
  name: string;
  rate: string;
  min: string;
  max: string;
}

async function findService(serviceId: string): Promise<RawService | null> {
  const raw = (await smmPost({ action: "services" })) as RawService[];
  if (!Array.isArray(raw)) return null;
  return raw.find((s) => String(s.service) === serviceId) ?? null;
}

router.post("/smm/order", requireAuth, async (req, res) => {
  const uid = userId(req);
  const { service, link, quantity } = (req.body ?? {}) as {
    service?: string;
    link?: string;
    quantity?: number;
  };
  const serviceId = String(service ?? "");
  const qty = Number(quantity);
  if (!serviceId || !link || !Number.isFinite(qty) || qty <= 0) {
    res.status(400).json({ ok: false, message: "service, link and quantity are required" });
    return;
  }

  // Never trust a client-supplied price: recompute from the live provider rate.
  let svc: RawService | null;
  try {
    svc = await findService(serviceId);
  } catch (err) {
    res.status(502).json({ ok: false, message: `Could not load service: ${String(err)}` });
    return;
  }
  if (!svc) {
    res.status(404).json({ ok: false, message: "Service not found" });
    return;
  }
  const min = Number(svc.min);
  const max = Number(svc.max);
  if ((Number.isFinite(min) && qty < min) || (Number.isFinite(max) && qty > max)) {
    res.status(400).json({ ok: false, message: `Quantity must be between ${svc.min} and ${svc.max}` });
    return;
  }

  const buyerRate = applyMarkup(Number(svc.rate));
  const charge = computeCharge(buyerRate, qty);

  // Atomically debit the wallet and create a pending order.
  let orderRow: { id: number; newBalance: string };
  try {
    orderRow = await db.transaction(async (tx) => {
      const [user] = await tx
        .select()
        .from(smmpUsers)
        .where(eq(smmpUsers.id, uid))
        .for("update");
      if (!user) throw new Error("ACCOUNT_NOT_FOUND");
      if (Number(user.balance) < charge) throw new Error("INSUFFICIENT_FUNDS");

      const newBalance = Number(user.balance) - charge;
      await tx
        .update(smmpUsers)
        .set({ balance: money(newBalance) })
        .where(eq(smmpUsers.id, uid));

      const [order] = await tx
        .insert(smmpOrders)
        .values({
          userId: uid,
          service: serviceId,
          serviceName: svc!.name,
          link: String(link),
          quantity: qty,
          charge: money(charge),
          status: "pending",
        })
        .returning({ id: smmpOrders.id });

      await tx.insert(smmpTransactions).values({
        userId: uid,
        type: "order",
        amount: money(-charge),
        balanceAfter: money(newBalance),
        status: "success",
        description: `Order #${order!.id} — ${svc!.name}`,
      });

      return { id: order!.id, newBalance: money(newBalance) };
    });
  } catch (err) {
    const msg = String(err);
    if (msg.includes("INSUFFICIENT_FUNDS")) {
      res.status(402).json({ ok: false, message: "Insufficient wallet balance. Please top up." });
      return;
    }
    res.status(500).json({ ok: false, message: "Could not place order" });
    return;
  }

  // Forward to the provider outside the DB transaction; refund on failure.
  try {
    const raw = (await smmPost({
      action: "add",
      service: serviceId,
      link: String(link),
      quantity: String(qty),
    })) as { order?: number | string; error?: string };

    if (raw.error || !raw.order) {
      await refundOrder(uid, orderRow.id, charge, raw.error ?? "Provider rejected the order");
      res.json({ ok: false, orderId: null, message: raw.error ?? "Order could not be placed; wallet refunded." });
      return;
    }

    await db
      .update(smmpOrders)
      .set({ providerOrderId: String(raw.order), status: "processing" })
      .where(eq(smmpOrders.id, orderRow.id));

    res.json({ ok: true, orderId: String(orderRow.id), message: null });
  } catch (err) {
    await refundOrder(uid, orderRow.id, charge, "Provider request failed");
    res.status(502).json({ ok: false, orderId: null, message: `Order failed; wallet refunded: ${String(err)}` });
  }
});

async function refundOrder(
  uid: number,
  orderId: number,
  amount: number,
  reason: string,
): Promise<void> {
  await db.transaction(async (tx) => {
    const [user] = await tx
      .select()
      .from(smmpUsers)
      .where(eq(smmpUsers.id, uid))
      .for("update");
    if (!user) return;
    const newBalance = Number(user.balance) + amount;
    await tx
      .update(smmpUsers)
      .set({ balance: money(newBalance) })
      .where(eq(smmpUsers.id, uid));
    await tx
      .update(smmpOrders)
      .set({ status: "failed" })
      .where(eq(smmpOrders.id, orderId));
    await tx.insert(smmpTransactions).values({
      userId: uid,
      type: "refund",
      amount: money(amount),
      balanceAfter: money(newBalance),
      status: "success",
      description: `Refund for order #${orderId} — ${reason}`,
    });
  });
}

router.get("/smm/orders", requireAuth, async (req, res) => {
  const uid = userId(req);
  const orders = await db
    .select()
    .from(smmpOrders)
    .where(eq(smmpOrders.userId, uid))
    .orderBy(desc(smmpOrders.createdAt))
    .limit(100);
  res.json({
    orders: orders.map((o) => ({
      id: String(o.id),
      providerOrderId: o.providerOrderId ?? null,
      service: o.service,
      serviceName: o.serviceName,
      link: o.link,
      quantity: o.quantity,
      charge: o.charge,
      currency: CURRENCY,
      status: o.status,
      createdAt: o.createdAt.toISOString(),
    })),
  });
});

router.get("/smm/order/:orderId", requireAuth, async (req, res) => {
  const uid = userId(req);
  const id = Number(req.params.orderId);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid order id" });
    return;
  }
  const [order] = await db
    .select()
    .from(smmpOrders)
    .where(and(eq(smmpOrders.id, id), eq(smmpOrders.userId, uid)));
  if (!order) {
    res.status(404).json({ error: "Order not found" });
    return;
  }

  let startCount: string | null = null;
  let remains: string | null = null;
  let status = order.status;

  if (order.providerOrderId) {
    try {
      const raw = (await smmPost({
        action: "status",
        order: order.providerOrderId,
      })) as {
        status?: string;
        start_count?: string;
        remains?: string;
        error?: string;
      };
      if (!raw.error) {
        status = (raw.status ?? order.status).toLowerCase();
        startCount = raw.start_count ?? null;
        remains = raw.remains ?? null;
        if (status !== order.status) {
          await db
            .update(smmpOrders)
            .set({ status })
            .where(eq(smmpOrders.id, order.id));
        }
      }
    } catch {
      // Fall back to the stored status on provider errors.
    }
  }

  res.json({
    orderId: String(order.id),
    providerOrderId: order.providerOrderId ?? null,
    serviceName: order.serviceName,
    link: order.link,
    quantity: order.quantity,
    charge: order.charge,
    currency: CURRENCY,
    status,
    startCount,
    remains,
    createdAt: order.createdAt.toISOString(),
  });
});

export default router;
