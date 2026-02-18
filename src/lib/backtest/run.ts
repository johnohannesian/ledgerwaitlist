/**
 * Backtest a simple bid/ask strategy on a price path.
 * Also supports "buy 10% below market" with configurable sell/hold rules.
 */

import type {
  BacktestParams,
  BacktestResult,
  BacktestStep,
  BuyDiscountParams,
  BuyDiscountResult,
  PricePoint,
} from "./types";

/**
 * Generate a price path using GBM (for when we don't have historical path).
 */
export function generatePath(
  initialPrice: number,
  drift: number,
  volatility: number,
  numDays: number,
  seed?: number
): PricePoint[] {
  const path: PricePoint[] = [{ day: 0, price: initialPrice }];
  const dt = 1 / 365;
  const rng = seed != null ? mulberry32(seed) : Math.random;

  for (let day = 1; day <= numDays; day++) {
    const z = normal(rng);
    const logReturn = (drift - (volatility ** 2) / 2) * dt + volatility * Math.sqrt(dt) * z;
    const prev = path[path.length - 1]!.price;
    path.push({ day, price: Math.max(0.01, prev * Math.exp(logReturn)) });
  }
  return path;
}

function mulberry32(seed: number): () => number {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function normal(rng: () => number): number {
  const u1 = rng();
  const u2 = rng();
  if (u1 <= 0) return normal(rng);
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

/**
 * Run backtest on the given path with bid/ask strategy.
 */
export function runBacktest(params: BacktestParams): BacktestResult {
  const {
    pricePath,
    bid,
    ask,
    initialCash,
    maxPosition = 10,
    tradeSize = 1,
  } = params;

  const steps: BacktestStep[] = [];
  let cash = initialCash;
  let position = 0;
  let totalCost = 0; // cost basis of current position
  let peakEquity = initialCash;
  let maxDrawdownPct = 0;
  let numBuys = 0;
  let numSells = 0;
  const sellPnls: number[] = [];

  for (let i = 0; i < pricePath.length; i++) {
    const { day, price } = pricePath[i]!;
    const positionBefore = position;
    const cashBefore = cash;
    let action: "buy" | "sell" | "hold" = "hold";
    let pnlRealized = 0;

    if (price <= bid && position < maxPosition && cash >= price * tradeSize) {
      const cost = price * tradeSize;
      cash -= cost;
      position += tradeSize;
      totalCost += cost;
      action = "buy";
      numBuys++;
    } else if (price >= ask && position >= tradeSize) {
      const avgCost = position > 0 ? totalCost / position : 0;
      const costOfSale = avgCost * tradeSize;
      totalCost -= costOfSale;
      const proceeds = price * tradeSize;
      cash += proceeds;
      position -= tradeSize;
      pnlRealized = proceeds - costOfSale;
      sellPnls.push(pnlRealized);
      action = "sell";
      numSells++;
    }

    const equity = cash + position * price;
    if (equity > peakEquity) peakEquity = equity;
    const drawdown = peakEquity > 0 ? (peakEquity - equity) / peakEquity : 0;
    if (drawdown > maxDrawdownPct) maxDrawdownPct = drawdown;

    steps.push({
      day,
      price,
      action,
      positionBefore,
      positionAfter: position,
      cashBefore,
      cashAfter: cash,
      pnlRealized,
    });
  }

  const lastPrice = pricePath[pricePath.length - 1]?.price ?? 0;
  const finalMtM = position * lastPrice;
  const totalPnl = cash + finalMtM - initialCash;
  const returnPct = initialCash > 0 ? totalPnl / initialCash : 0;
  const winRatePct =
    sellPnls.length > 0
      ? (sellPnls.filter((p) => p > 0).length / sellPnls.length) * 100
      : 0;

  return {
    steps,
    finalCash: cash,
    finalPosition: position,
    finalMtM,
    totalPnl,
    returnPct,
    numBuys,
    numSells,
    maxDrawdownPct: maxDrawdownPct * 100,
    winRatePct,
  };
}

/** SMA of last `window` prices before index i (exclusive of i). */
function sma(prices: number[], i: number, window: number): number {
  const start = Math.max(0, i - window);
  const slice = prices.slice(start, i);
  if (slice.length === 0) return prices[i] ?? 0;
  return slice.reduce((a, b) => a + b, 0) / slice.length;
}

/**
 * Backtest "buy 10% below market": pay price * (1 - buyDiscountPct) when we buy;
 * fair value = SMA of recent prices; buy when price <= fairValue * (1 - buyDiscountPct).
 * Sell when hold_days reached OR price >= entry * (1 + sellTargetPct). FIFO lots.
 */
export function runBacktestBuyDiscount(params: BuyDiscountParams): BuyDiscountResult {
  const {
    pricePath,
    buyDiscountPct,
    fairValueWindow = 20,
    sellAfterDays,
    sellTargetPct,
    initialCash,
    maxPosition = 10,
    tradeSize = 1,
  } = params;

  const prices = pricePath.map((p) => p.price);
  const steps: BacktestStep[] = [];
  let cash = initialCash;
  const lots: { entryDay: number; entryPrice: number }[] = [];
  let peakEquity = initialCash;
  let maxDrawdownPct = 0;
  const sellPnls: number[] = [];

  for (let i = 0; i < pricePath.length; i++) {
    const { day, price } = pricePath[i]!;
    const positionBefore = lots.length * tradeSize;
    const cashBefore = cash;
    let action: "buy" | "sell" | "hold" = "hold";
    let pnlRealized = 0;

    const fairValue = sma(prices, i, fairValueWindow);
    const buyThreshold = fairValue * (1 - buyDiscountPct);
    const payPrice = price * (1 - buyDiscountPct);

    // Sell: check oldest lot first (FIFO). Sell if hold_days met or price target met.
    if (lots.length > 0) {
      const lot = lots[0]!;
      const daysHeld = day - lot.entryDay;
      const targetPrice = lot.entryPrice * (1 + sellTargetPct);
      const sellByTime = sellAfterDays > 0 && daysHeld >= sellAfterDays;
      const sellByTarget = price >= targetPrice;
      if (sellByTime || sellByTarget) {
        lots.shift();
        const proceeds = price * tradeSize;
        const costOfSale = lot.entryPrice * tradeSize;
        cash += proceeds;
        pnlRealized = proceeds - costOfSale;
        sellPnls.push(pnlRealized);
        action = "sell";
      }
    }

    // Buy: when price <= fairValue * (1 - buyDiscountPct) and we have room and cash
    if (
      action === "hold" &&
      price <= buyThreshold &&
      lots.length < maxPosition &&
      cash >= payPrice * tradeSize
    ) {
      cash -= payPrice * tradeSize;
      lots.push({ entryDay: day, entryPrice: payPrice });
      action = "buy";
    }

    const positionAfter = lots.length * tradeSize;
    const equity = cash + positionAfter * price;
    if (equity > peakEquity) peakEquity = equity;
    const drawdown = peakEquity > 0 ? (peakEquity - equity) / peakEquity : 0;
    if (drawdown > maxDrawdownPct) maxDrawdownPct = drawdown;

    steps.push({
      day,
      price,
      action,
      positionBefore,
      positionAfter,
      cashBefore,
      cashAfter: cash,
      pnlRealized,
    });
  }

  const lastPrice = pricePath[pricePath.length - 1]?.price ?? 0;
  const finalPosition = lots.length * tradeSize;
  const finalMtM = finalPosition * lastPrice;
  const totalPnl = cash + finalMtM - initialCash;
  const returnPct = initialCash > 0 ? totalPnl / initialCash : 0;
  const winRatePct =
    sellPnls.length > 0
      ? (sellPnls.filter((p) => p > 0).length / sellPnls.length) * 100
      : 0;

  return {
    steps,
    finalCash: cash,
    finalPosition,
    finalMtM,
    totalPnl,
    returnPct,
    numBuys: steps.filter((s) => s.action === "buy").length,
    numSells: sellPnls.length,
    maxDrawdownPct: maxDrawdownPct * 100,
    winRatePct,
    sellAfterDays,
    sellTargetPct,
  };
}

/** Run buy-discount backtest over a grid of (sellAfterDays, sellTargetPct). */
export function runBacktestBuyDiscountGrid(
  params: Omit<BuyDiscountParams, "sellAfterDays" | "sellTargetPct">,
  sellAfterDaysList: number[],
  sellTargetPctList: number[]
): BuyDiscountResult[] {
  const results: BuyDiscountResult[] = [];
  for (const sellAfterDays of sellAfterDaysList) {
    for (const sellTargetPct of sellTargetPctList) {
      results.push(
        runBacktestBuyDiscount({
          ...params,
          sellAfterDays,
          sellTargetPct,
        })
      );
    }
  }
  return results;
}
