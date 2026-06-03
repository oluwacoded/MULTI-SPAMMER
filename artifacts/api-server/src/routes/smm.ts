import { Router, type IRouter } from "express";
import { applyMarkup } from "../lib/smmPricing.js";

const router: IRouter = Router();

const SMM_API = "https://reallysimplesocial.com/api/v2";
const API_KEY = process.env.SMM_API_KEY ?? "";

export async function smmPost(params: Record<string, string>): Promise<unknown> {
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
        // Buyers see the marked-up rate, never the raw provider cost.
        rate: applyMarkup(Number(s.rate)).toString(),
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

// Order placement, status and balance are buyer-scoped and live in the
// authenticated storefront router (smmPanel.ts).

export default router;
