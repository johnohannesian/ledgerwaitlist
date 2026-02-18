#!/usr/bin/env python3
"""
CLI to run backtest and Monte Carlo for a specific SKU (e.g. "2024 Anthony Edwards Prizm PSA 10").
Usage:
  python3 cli.py backtest --sku "2024 Anthony Edwards Prizm PSA 10" --sold data/sold.json --out equity.png
  python3 cli.py monte-carlo --paths 10000 --out dist.png
  python3 cli.py full --sku "2024 Anthony Edwards Prizm PSA 10" --sold data/sold.json --out-dir outputs
"""

import argparse
from pathlib import Path

import numpy as np
import pandas as pd

from backtester import Backtester, BacktestConfig, BacktestMetrics
from data_processor import DataProcessor
from ingest import build_time_series, load_ebay_sold, load_ebay_active
from simulator import run_portfolio_monte_carlo, PortfolioSimulatorConfig
from viz import plot_equity_vs_hold, plot_monte_carlo_distribution


def _slug(sku: str) -> str:
    return "".join(c if c.isalnum() or c in " -_" else "_" for c in sku.strip()).strip().replace(" ", "_")


def run_backtest(
    sold_path: str,
    active_path: str | None = None,
    sku: str = "",
    out_path: str | None = None,
    initial_cash: float = 100_000.0,
    spread_bps: float = 200.0,
) -> BacktestMetrics:
    """Load eBay data, run backtester, optionally plot equity vs hold."""
    sold_df = load_ebay_sold(sold_path)
    active_df = load_ebay_active(active_path) if active_path and Path(active_path).exists() else None
    ts_df = build_time_series(sold_df, active_df)

    if ts_df.empty:
        # No data: create minimal synthetic series so backtester runs
        ts_df = pd.DataFrame({
            "date": pd.date_range(start="2024-01-01", periods=90, freq="D"),
            "fill_price": 100.0,
            "fill_volume": 1,
            "best_ask": 102.0,
            "volume": 1,
        })

    config = BacktestConfig(
        initial_cash=initial_cash,
        spread_bps=spread_bps,
    )
    bt = Backtester(config)
    bt.ingest(ts_df)
    metrics = bt.run()

    print(f"[Backtest] SKU: {sku or 'N/A'}")
    print(f"  Total PnL:        ${metrics.total_pnl:,.2f}")
    print(f"  Sharpe Ratio:    {metrics.sharpe_ratio:.3f}")
    print(f"  Max Drawdown:    {metrics.max_drawdown_pct:.2f}%")
    print(f"  Inventory Risk: ${metrics.inventory_risk_cost:,.2f}")
    print(f"  Trades:          {metrics.num_trades}  |  Win rate: {metrics.win_rate_pct:.1f}%")

    if out_path and len(metrics.equity_curve) > 0 and len(metrics.hold_curve) > 0:
        plot_equity_vs_hold(
            metrics.equity_curve,
            metrics.hold_curve,
            output_path=out_path,
            title="Equity Curve: Market-Making vs Hold",
            sku_label=sku or Path(sold_path).stem,
        )
        print(f"  Plot saved:       {out_path}")

    return metrics


def run_monte_carlo(
    num_paths: int = 10_000,
    out_path: str | None = None,
    seed: int | None = None,
    sold_paths: list[str] | None = None,
    initial_cash: float = 100_000.0,
) -> dict:
    """Run vectorized portfolio Monte Carlo. If sold_paths provided, use DataProcessor for per-SKU mu/sigma/liquidity."""
    if sold_paths:
        proc = DataProcessor()
        sku_paths = {Path(p).stem or f"SKU_{i}": p for i, p in enumerate(sold_paths)}
        sku_params = proc.ingest_files(sku_paths)
        if not sku_params:
            raise ValueError("No valid SKU data from Sold JSONs (need price and timestamp, pass cleaning).")
        config = PortfolioSimulatorConfig(
            initial_capital=initial_cash,
            num_paths=num_paths,
            num_days=252,
            sku_params=sku_params,
            seed=seed,
        )
        result = run_portfolio_monte_carlo(config)
    else:
        config = PortfolioSimulatorConfig(
            initial_capital=initial_cash,
            num_paths=num_paths,
            num_days=252,
            sku_params={"Default": {"mu": 0.05, "sigma": 0.35, "liquidity_score": 0.5}},
            seed=seed,
        )
        result = run_portfolio_monte_carlo(config)

    print("[Monte Carlo] (portfolio, vectorized)")
    print(f"  Paths:           {num_paths}  |  SKUs: {result.get('num_skus', '-')}")
    print(f"  Mean outcome:   ${result['mean']:,.2f}")
    print(f"  Std:            ${result['std']:,.2f}")
    print(f"  5th / 50th / 95th percentile:  ${result['p5']:,.0f}  /  ${result['p50']:,.0f}  /  ${result['p95']:,.0f}")
    print(f"  Probability of Ruin (<50% initial):  {result['probability_of_ruin']:.2%}")
    print(f"  Ruin (staleness):  {result['probability_of_ruin_staleness']:.2%}")

    if out_path:
        plot_monte_carlo_distribution(
            result["final_values"],
            output_path=out_path,
            title="Monte Carlo: Portfolio Outcome Distribution",
        )
        print(f"  Plot saved:       {out_path}")

    return result


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Backtest and Monte Carlo for trading-card market-making (eBay API data).",
    )
    sub = parser.add_subparsers(dest="command", required=True)

    # backtest
    p_bt = sub.add_parser("backtest", help="Run backtest on eBay Sold (and optional Active) JSON")
    p_bt.add_argument("--sku", type=str, default="", help="SKU label (e.g. '2024 Anthony Edwards Prizm PSA 10')")
    p_bt.add_argument("--sold", type=str, required=True, help="Path to eBay Sold listings JSON")
    p_bt.add_argument("--active", type=str, default=None, help="Path to eBay Active listings JSON (optional)")
    p_bt.add_argument("--out", type=str, default=None, help="Output path for equity curve plot")
    p_bt.add_argument("--initial-cash", type=float, default=100_000.0)
    p_bt.add_argument("--spread-bps", type=float, default=200.0, help="Bid-ask spread in bps")

    # monte-carlo
    p_mc = sub.add_parser("monte-carlo", help="Run vectorized portfolio Monte Carlo (optional: one Sold JSON per SKU)")
    p_mc.add_argument("--paths", type=int, default=10_000)
    p_mc.add_argument("--sold", type=str, action="append", dest="sold_list", help="Path to Sold JSON (repeat for multiple SKUs)")
    p_mc.add_argument("--out", type=str, default=None, help="Output path for distribution plot")
    p_mc.add_argument("--seed", type=int, default=None)
    p_mc.add_argument("--initial-cash", type=float, default=100_000.0)

    # full: backtest + monte-carlo + plots
    p_full = sub.add_parser("full", help="Run backtest and Monte Carlo, write plots to --out-dir")
    p_full.add_argument("--sku", type=str, default="", help="SKU label")
    p_full.add_argument("--sold", type=str, required=True, help="Path to Sold JSON")
    p_full.add_argument("--active", type=str, default=None)
    p_full.add_argument("--out-dir", type=str, default="outputs", help="Directory for equity and distribution plots")

    args = parser.parse_args()

    if args.command == "backtest":
        run_backtest(
            sold_path=args.sold,
            active_path=args.active,
            sku=args.sku,
            out_path=args.out,
            initial_cash=args.initial_cash,
            spread_bps=args.spread_bps,
        )
    elif args.command == "monte-carlo":
        run_monte_carlo(
            num_paths=args.paths,
            out_path=args.out,
            seed=args.seed,
            sold_paths=getattr(args, "sold_list", None) or [],
            initial_cash=args.initial_cash,
        )
    elif args.command == "full":
        out_dir = Path(args.out_dir)
        out_dir.mkdir(parents=True, exist_ok=True)
        slug = _slug(args.sku) or "run"
        run_backtest(
            sold_path=args.sold,
            active_path=args.active,
            sku=args.sku,
            out_path=str(out_dir / f"equity_{slug}.png"),
            initial_cash=100_000.0,
            spread_bps=200.0,
        )
        run_monte_carlo(
            num_paths=10_000,
            out_path=str(out_dir / f"monte_carlo_{slug}.png"),
            seed=42,
            sold_paths=[args.sold],
            initial_cash=100_000.0,
        )
        print(f"Outputs written to {out_dir}")


if __name__ == "__main__":
    main()
