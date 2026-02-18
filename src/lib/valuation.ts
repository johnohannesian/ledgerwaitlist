/**
 * Our determined value: comps-based with optional population adjustment.
 */

import type { Comp, DeterminedValue } from "@/types/card";

export type ValuationMethod = "comps_median" | "comps_weighted" | "comps_pop_adjusted";

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** Weight recent comps more (exponential decay by days ago). */
function weightedAverage(comps: Comp[], halfLifeDays = 30): number {
  if (comps.length === 0) return 0;
  const now = Date.now();
  let sum = 0;
  let weightSum = 0;
  for (const c of comps) {
    const daysAgo = (now - new Date(c.soldAt).getTime()) / (24 * 60 * 60 * 1000);
    const w = Math.pow(0.5, daysAgo / halfLifeDays);
    sum += c.price * w;
    weightSum += w;
  }
  return weightSum > 0 ? sum / weightSum : 0;
}

export function computeDeterminedValue(
  cardId: string,
  comps: Comp[],
  population?: number | null,
  method: ValuationMethod = "comps_weighted"
): DeterminedValue | null {
  if (comps.length === 0) return null;

  const prices = comps.map((c) => c.price);
  const lastCompsAt = comps[0]?.soldAt;
  const compCount = comps.length;

  let value: number;
  if (method === "comps_median") {
    value = median(prices);
  } else if (method === "comps_weighted") {
    value = Math.round(weightedAverage(comps));
  } else {
    value = Math.round(weightedAverage(comps));
    if (population != null && population > 0) {
      // Scarcity bump: lower pop -> slight premium (cap at 15%)
      const scarcityFactor = Math.min(1.15, 1 + 500 / population);
      value = Math.round(value * scarcityFactor);
    }
  }

  let confidence: DeterminedValue["confidence"] = "low";
  if (compCount >= 5) confidence = "high";
  else if (compCount >= 2) confidence = "medium";

  const daysSinceLastComp = lastCompsAt ? (Date.now() - new Date(lastCompsAt).getTime()) / (24 * 60 * 60 * 1000) : 999;
  if (daysSinceLastComp > 60 && confidence === "high") confidence = "medium";
  if (daysSinceLastComp > 90) confidence = "low";

  return {
    cardId,
    value,
    confidence,
    compCount,
    lastCompsAt,
    method,
  };
}
