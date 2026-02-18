import { NextResponse } from "next/server";
import { runMonteCarlo, deriveStrategy } from "@/lib/monte-carlo/simulate";
import { estimateParamsFromComps } from "@/lib/monte-carlo/estimate-params";
import { getEbayCategoryById } from "@/lib/ebay/categories";
import type { MonteCarloParams } from "@/lib/monte-carlo/types";
import type { Comp } from "@/types/card";

export interface SimulateRequestBody {
  /** Use comps to estimate initialPrice, drift, volatility. */
  comps?: Comp[];
  /** Or set params explicitly (comps can still override initialPrice). */
  initialPrice?: number;
  drift?: number;
  volatility?: number;
  numPaths?: number;
  horizonDays?: number;
  seed?: number;
  /** Strategy percentiles: bid (default 25), ask (default 75). */
  bidPercentile?: number;
  askPercentile?: number;
  /** eBay category for scoping (Trading Cards, Memorabilia, etc.). Applies category default vol/drift if not provided. */
  categoryId?: string;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as SimulateRequestBody;
    const {
      comps,
      initialPrice: inputPrice,
      drift: inputDrift,
      volatility: inputVol,
      numPaths = 5000,
      horizonDays = 30,
      seed,
      bidPercentile = 25,
      askPercentile = 75,
      categoryId,
    } = body;

    const category = categoryId ? getEbayCategoryById(categoryId) : undefined;

    let initialPrice = inputPrice ?? 100;
    let drift = inputDrift !== undefined ? inputDrift : (category?.defaultDrift ?? 0);
    let volatility = inputVol !== undefined ? inputVol : (category?.defaultVolatility ?? 0.3);

    if (comps && comps.length > 0) {
      const estimated = estimateParamsFromComps(comps);
      initialPrice = estimated.initialPrice;
      if (estimated.drift !== 0 || estimated.volatility !== 0) {
        drift = estimated.drift;
        volatility = estimated.volatility;
      }
    }

    const params: MonteCarloParams = {
      initialPrice,
      drift,
      volatility,
      numPaths,
      horizonDays,
      seed,
    };

    const result = runMonteCarlo(params);
    const strategy = deriveStrategy(result, {
      bidPercentile,
      askPercentile,
    });

    return NextResponse.json({
      monteCarlo: {
        percentiles: result.percentiles,
        mean: result.mean,
        stdDev: result.stdDev,
        params: result.params,
      },
      strategy,
      estimatedFromComps: comps != null && comps.length > 0,
      category: category ? { id: category.id, name: category.name } : null,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Simulation failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
