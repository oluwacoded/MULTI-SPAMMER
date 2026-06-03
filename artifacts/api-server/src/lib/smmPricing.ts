import { readJson } from "./dataStore.js";

const DEFAULT_MARKUP = 20;

// The reseller's percentage markup is shared with the Telegram bot via
// data/settings.json (`smmMarkup`). Buyers always see and pay the marked-up
// price; the difference between the buyer price and the provider cost is margin.
export function getMarkupPercent(): number {
  const settings = readJson<{ smmMarkup?: number }>("settings.json", {});
  const m = Number(settings.smmMarkup);
  return Number.isFinite(m) && m >= 0 ? m : DEFAULT_MARKUP;
}

// Apply markup to a provider rate (NGN per 1000). Rounded to 4 dp.
export function applyMarkup(providerRate: number, markup = getMarkupPercent()): number {
  if (!Number.isFinite(providerRate)) return 0;
  return Math.round(providerRate * (1 + markup / 100) * 10000) / 10000;
}

// Compute what a buyer is charged for `quantity` units of a service whose
// marked-up rate is per 1000 units. Rounded to 4 dp.
export function computeCharge(buyerRatePer1000: number, quantity: number): number {
  const raw = (buyerRatePer1000 * quantity) / 1000;
  return Math.round(raw * 10000) / 10000;
}
