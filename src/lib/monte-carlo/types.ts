/**
 * Types for Monte Carlo simulation and derived pricing strategy.
 */

export interface MonteCarloParams {
  /** Current or reference price (e.g. from comps mean or eBay). */
  initialPrice: number;
  /** Annualized drift (expected return). E.g. 0.05 = 5%. */
  drift: number;
  /** Annualized volatility (std dev of log returns). E.g. 0.30 = 30%. */
  volatility: number;
  /** Number of paths to simulate. */
  numPaths: number;
  /** Horizon in days. */
  horizonDays: number;
  /** Optional: fix seed for reproducibility. */
  seed?: number;
}

export interface MonteCarloResult {
  /** Simulated prices at horizon (one per path). */
  terminalPrices: number[];
  /** Percentiles of terminal price (5, 25, 50, 75, 95). */
  percentiles: { p5: number; p25: number; p50: number; p75: number; p95: number };
  /** Mean and std dev of terminal price. */
  mean: number;
  stdDev: number;
  /** Parameters used. */
  params: MonteCarloParams;
}

/** Strategy derived from MC distribution: bid/ask around fair value. */
export interface PricingStrategy {
  /** Fair value (e.g. median or mean of terminal distribution). */
  fairValue: number;
  /** Suggested bid (e.g. p25 or mean - k*sigma). */
  bid: number;
  /** Suggested ask (e.g. p75 or mean + k*sigma). */
  ask: number;
  /** Spread as fraction of fair value. */
  spreadPct: number;
  /** Percentiles used for bid/ask (e.g. "p25/p75"). */
  method: string;
}
