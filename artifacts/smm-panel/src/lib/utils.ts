import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

const CURRENCY_SYMBOLS: Record<string, string> = {
  NGN: "₦",
  USD: "$",
  EUR: "€",
  GBP: "£",
};

export function currencySymbol(currency?: string | null): string {
  if (!currency) return "₦";
  return CURRENCY_SYMBOLS[currency.toUpperCase()] ?? `${currency} `;
}

export function formatMoney(
  amount: number | string | null | undefined,
  currency?: string | null,
  decimals = 2,
): string {
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  if (num == null || Number.isNaN(num)) return "—";
  return `${currencySymbol(currency)}${num.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
}
