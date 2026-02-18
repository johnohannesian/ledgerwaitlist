/**
 * Monte Carlo price simulation using Geometric Brownian Motion.
 * S(t) = S0 * exp((mu - sigma²/2)*t + sigma*W(t))
 * With t in years; drift and volatility annualized.
 */

import type { MonteCarloParams, MonteCarloResult, PricingStrategy } from "./types";

/** Simple seeded RNG (Mulberry32) for reproducible paths. */
function mulberry32(seed: number): () => number {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Box-Muller: two normal samples from two uniforms. */
function normal(rng: () => number): number {
  const u1 = rng();
  const u2 = rng();
  if (u1 <= 0) return normal(rng);
  const r = Math.sqrt(-2 * Math.log(u1));
  return r * Math.cos(2 * Math.PI * u2);
}

/**
 * Run Monte Carlo simulation.
 */
export function runMonteCarlo(params: MonteCarloParams): MonteCarloResult {
  const {
    initialPrice,
    drift,
    volatility,
    numPaths,
    horizonDays,
    seed,
  } = params;

  const T = horizonDays / 365;
  const mu = drift;
  const sigma = volatility;
  const rng = seed != null ? mulberry32(seed) : Math.random;
  const terminalPrices: number[] = [];

  for (let i = 0; i < numPaths; i++) {
    const z = normal(rng);
    const logReturn = (mu - (sigma * sigma) / 2) * T + sigma * Math.sqrt(T) * z;
    terminalPrices.push(initialPrice * Math.exp(logReturn));
  }

  terminalPrices.sort((a, b) => a - b);
  const mean = terminalPrices.reduce((s, p) => s + p, 0) / numPaths;
  const variance =
    terminalPrices.reduce((s, p) => s + (p - mean) ** 2, 0) / numPaths;
  const stdDev = Math.sqrt(variance);

  const p = (q: number) => {
    const idx = Math.max(0, Math.min(numPaths - 1, Math.floor((q / 100) * numPaths)));
    return terminalPrices[idx]!;
  };

  return {
    terminalPrices,
    percentiles: { p5: p(5), p25: p(25), p50: p(50), p75: p(75), p95: p(95) },
    mean,
    stdDev,
    params,
  };
}

/**
 * Derive a pricing strategy from the MC result.
 * Default: bid = p25, ask = p75 (interquartile as spread).
 */
export function deriveStrategy(
  result: MonteCarloResult,
  options?: { bidPercentile?: number; askPercentile?: number }
): PricingStrategy {
  const { percentiles, mean } = result;
  const bidP = options?.bidPercentile ?? 25;
  const askP = options?.askPercentile ?? 75;
  const p = (q: number) => {
    const idx = Math.floor((q / 100) * result.terminalPrices.length);
    return result.terminalPrices[Math.max(0, Math.min(idx, result.terminalPrices.length - 1))]!;
  };
  const bid = bidP === 25 ? percentiles.p25 : p(bidP);
  const ask = askP === 75 ? percentiles.p75 : p(askP);
  const fairValue = percentiles.p50;
  const spreadPct = fairValue > 0 ? ((ask - bid) / fairValue) * 100 : 0;

  return {
    fairValue: Math.round(fairValue * 100) / 100,
    bid: Math.round(bid * 100) / 100,
    ask: Math.round(ask * 100) / 100,
    spreadPct: Math.round(spreadPct * 100) / 100,
    method: `p${bidP}/p${askP}`,
  };
}
