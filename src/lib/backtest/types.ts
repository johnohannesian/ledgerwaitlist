/**
 * Backtest types: price path, strategy rules, and results.
 */

export interface PricePoint {
  day: number;
  price: number;
}

/** One day's outcome in the backtest. */
export interface BacktestStep {
  day: number;
  price: number;
  action: "buy" | "sell" | "hold";
  positionBefore: number;
  positionAfter: number;
  cashBefore: number;
  cashAfter: number;
  pnlRealized: number;
}

export interface BacktestParams {
  /** Price path (day 0 = start). */
  pricePath: PricePoint[];
  /** Bid threshold: buy when market price <= bid. */
  bid: number;
  /** Ask threshold: sell when market price >= ask. */
  ask: number;
  /** Starting cash. */
  initialCash: number;
  /** Max position size (number of units). */
  maxPosition?: number;
  /** Trade size per execution (default 1). */
  tradeSize?: number;
}

export interface BacktestResult {
  steps: BacktestStep[];
  finalCash: number;
  finalPosition: number;
  finalMtM: number;
  totalPnl: number;
  returnPct: number;
  numBuys: number;
  numSells: number;
  maxDrawdownPct: number;
  winRatePct: number;
}

/** Strategy: buy at (1 - buyDiscountPct) * market; sell by hold time and/or profit target. */
export interface BuyDiscountParams {
  pricePath: PricePoint[];
  /** Buy when price <= fairValue * (1 - buyDiscountPct). Pay price * (1 - buyDiscountPct). */
  buyDiscountPct: number;
  /** Fair value = SMA of last fairValueWindow points (default 20). */
  fairValueWindow?: number;
  /** Sell when days_held >= sellAfterDays (optional; use 0 or Infinity to ignore). */
  sellAfterDays: number;
  /** Sell when price >= entry_price * (1 + sellTargetPct). */
  sellTargetPct: number;
  initialCash: number;
  maxPosition?: number;
  tradeSize?: number;
}

export interface BuyDiscountResult extends BacktestResult {
  sellAfterDays: number;
  sellTargetPct: number;
}
