import { NextResponse } from "next/server";
import { runBacktest, generatePath } from "@/lib/backtest/run";
import { getEbayCategoryById } from "@/lib/ebay/categories";

export interface BacktestRequestBody {
  /** Precomputed path. If not set, path is generated from GBM. */
  pricePath?: { day: number; price: number }[];
  /** For generated path. */
  initialPrice?: number;
  drift?: number;
  volatility?: number;
  numDays?: number;
  pathSeed?: number;
  /** Strategy. */
  bid: number;
  ask: number;
  initialCash?: number;
  maxPosition?: number;
  tradeSize?: number;
  /** eBay category (for labeling: Trading Cards, Memorabilia, etc.). */
  categoryId?: string;
  categoryName?: string;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as BacktestRequestBody;
    const {
      pricePath: inputPath,
      initialPrice = 100,
      drift = 0,
      volatility = 0.3,
      numDays = 90,
      pathSeed,
      bid,
      ask,
      initialCash = 10000,
      maxPosition = 5,
      tradeSize = 1,
      categoryId,
      categoryName,
    } = body;

    const category = categoryId ? getEbayCategoryById(categoryId) : null;
    const resolvedCategoryName = categoryName ?? category?.name ?? null;

    let pricePath = inputPath;
    if (!pricePath || pricePath.length === 0) {
      pricePath = generatePath(
        initialPrice,
        drift,
        volatility,
        numDays,
        pathSeed
      );
    }

    const result = runBacktest({
      pricePath,
      bid,
      ask,
      initialCash,
      maxPosition,
      tradeSize,
    });

    return NextResponse.json({
      ...result,
      pathLength: pricePath.length,
      category: resolvedCategoryName ? { id: categoryId ?? null, name: resolvedCategoryName } : null,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Backtest failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
