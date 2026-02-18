import { NextResponse } from "next/server";
import {
  runBacktestBuyDiscountGrid,
  generatePath,
} from "@/lib/backtest/run";

export interface BuyDiscountBacktestBody {
  pricePath?: { day: number; price: number }[];
  initialPrice?: number;
  drift?: number;
  volatility?: number;
  numDays?: number;
  pathSeed?: number;
  /** Buy at this % below market (default 0.10 = 10%). */
  buyDiscountPct?: number;
  fairValueWindow?: number;
  /** Hold days to test (e.g. [7, 14, 30]). */
  sellAfterDaysList: number[];
  /** Sell target % gain to test (e.g. [0.05, 0.10, 0.15]). */
  sellTargetPctList: number[];
  initialCash?: number;
  maxPosition?: number;
  tradeSize?: number;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as BuyDiscountBacktestBody;
    const {
      pricePath: inputPath,
      initialPrice = 100,
      drift = 0,
      volatility = 0.3,
      numDays = 90,
      pathSeed,
      buyDiscountPct = 0.10,
      fairValueWindow = 20,
      sellAfterDaysList,
      sellTargetPctList,
      initialCash = 10000,
      maxPosition = 5,
      tradeSize = 1,
    } = body;

    if (
      !Array.isArray(sellAfterDaysList) ||
      !Array.isArray(sellTargetPctList) ||
      sellAfterDaysList.length === 0 ||
      sellTargetPctList.length === 0
    ) {
      return NextResponse.json(
        { error: "sellAfterDaysList and sellTargetPctList must be non-empty arrays." },
        { status: 400 }
      );
    }

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

    const results = runBacktestBuyDiscountGrid(
      {
        pricePath,
        buyDiscountPct,
        fairValueWindow,
        initialCash,
        maxPosition,
        tradeSize,
      },
      sellAfterDaysList,
      sellTargetPctList
    );

    return NextResponse.json({
      results,
      pathLength: pricePath.length,
      buyDiscountPct,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Backtest failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
