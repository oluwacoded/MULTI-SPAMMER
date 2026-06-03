import { Router, type IRouter } from "express";

const router: IRouter = Router();

const SMM_API = "https://reallysimplesocial.com/api/v2";
const API_KEY = process.env.SMM_API_KEY ?? "";

async function smmPost(params: Record<string, string>): Promise<unknown> {
  const body = new URLSearchParams({ key: API_KEY, ...params });
  const res = await fetch(SMM_API, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!res.ok) throw new Error(`SMM API error: ${res.status}`);
  return res.json();
}

let servicesCache: { data: unknown; at: number } | null = null;
const CACHE_TTL = 10 * 60 * 1000;

router.get("/smm/services", async (_req, res) => {
  try {
    if (servicesCache && Date.now() - servicesCache.at < CACHE_TTL) {
      res.json(servicesCache.data);
      return;
    }

    const raw = (await smmPost({ action: "services" })) as Array<{
      service: string;
      name: string;
      type: string;
      rate: string;
      min: string;
      max: string;
      category: string;
      description?: string;
    }>;

    const services = Array.isArray(raw) ? raw : [];
    const categorySet = new Set<string>();
    for (const s of services) {
      if (s.category) categorySet.add(s.category);
    }

    const result = {
      services: services.map((s) => ({
        service: String(s.service),
        name: String(s.name),
        type: String(s.type),
        rate: String(s.rate),
        min: String(s.min),
        max: String(s.max),
        category: String(s.category),
        description: s.description ?? null,
      })),
      categories: Array.from(categorySet).sort(),
    };

    servicesCache = { data: result, at: Date.now() };
    res.json(result);
  } catch (err) {
    res.status(502).json({ error: "Failed to fetch services", detail: String(err) });
  }
});

router.post("/smm/order", async (req, res) => {
  try {
    const { service, link, quantity } = req.body as {
      service: string;
      link: string;
      quantity: number;
    };

    if (!service || !link || !quantity) {
      res.status(400).json({ ok: false, message: "service, link and quantity are required" });
      return;
    }

    const raw = (await smmPost({
      action: "add",
      service: String(service),
      link: String(link),
      quantity: String(quantity),
    })) as { order?: number | string; error?: string };

    if (raw.error) {
      res.json({ ok: false, orderId: null, message: raw.error });
      return;
    }

    res.json({ ok: true, orderId: raw.order ? String(raw.order) : null, message: null });
  } catch (err) {
    res.status(502).json({ ok: false, orderId: null, message: String(err) });
  }
});

router.get("/smm/order/:orderId", async (req, res) => {
  try {
    const { orderId } = req.params;

    const raw = (await smmPost({ action: "status", order: orderId })) as {
      status?: string;
      charge?: string;
      start_count?: string;
      remains?: string;
      currency?: string;
      error?: string;
    };

    if (raw.error) {
      res.status(404).json({ orderId, status: "not_found", charge: null, startCount: null, remains: null, currency: null });
      return;
    }

    res.json({
      orderId,
      status: raw.status ?? "unknown",
      charge: raw.charge ?? null,
      startCount: raw.start_count ?? null,
      remains: raw.remains ?? null,
      currency: raw.currency ?? null,
    });
  } catch (err) {
    res.status(502).json({ orderId: req.params.orderId, status: "error", charge: null, startCount: null, remains: null, currency: null });
  }
});

router.get("/smm/balance", async (_req, res) => {
  try {
    const raw = (await smmPost({ action: "balance" })) as {
      balance?: string;
      currency?: string;
      error?: string;
    };

    if (raw.error) {
      res.status(502).json({ balance: "0", currency: "USD" });
      return;
    }

    res.json({ balance: raw.balance ?? "0", currency: raw.currency ?? "USD" });
  } catch (err) {
    res.status(502).json({ balance: "0", currency: "USD" });
  }
});

export default router;
