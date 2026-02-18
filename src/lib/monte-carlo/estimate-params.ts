/**
 * Estimate drift and volatility from comps (or any price history)
 * for use in Monte Carlo.
 */

import type { Comp } from "@/types/card";

/**
 * From a list of comps (newest first or last first), compute:
 * - mean price -> initialPrice
 * - log returns std dev -> volatility (annualized assuming ~1 sale per N days)
 * - optional drift from trend (or assume 0).
 */
export function estimateParamsFromComps(
  comps: Comp[],
  options?: { assumedSalesPerYear?: number }
): { initialPrice: number; drift: number; volatility: number } {
  const salesPerYear = options?.assumedSalesPerYear ?? 12; // e.g. ~monthly
  if (comps.length < 2) {
    const initialPrice = comps[0]?.price ?? 0;
    return { initialPrice, drift: 0, volatility: 0.25 };
  }

  const sorted = [...comps].sort(
    (a, b) => new Date(a.soldAt).getTime() - new Date(b.soldAt).getTime()
  );
  const prices = sorted.map((c) => c.price);
  const initialPrice = prices[prices.length - 1]!; // most recent

  const logReturns: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    const prev = prices[i - 1]!;
    const curr = prices[i]!;
    if (prev > 0) logReturns.push(Math.log(curr / prev));
  }

  if (logReturns.length === 0) {
    return { initialPrice, drift: 0, volatility: 0.25 };
  }

  const meanReturn = logReturns.reduce((a, b) => a + b, 0) / logReturns.length;
  const variance =
    logReturns.reduce((s, r) => s + (r - meanReturn) ** 2, 0) / logReturns.length;
  const stdReturn = Math.sqrt(variance);
  // Annualize: if we have ~1 observation per (365/salesPerYear) days
  const annualization = Math.sqrt(salesPerYear);
  const volatility = Math.max(0.1, stdReturn * annualization);
  const drift = meanReturn * salesPerYear;

  return {
    initialPrice,
    drift: Number.isFinite(drift) ? drift : 0,
    volatility: Number.isFinite(volatility) ? volatility : 0.25,
  };
}
