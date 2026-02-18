"""
Streamlit dashboard to visualize backtest and Monte Carlo simulation outcomes.
Run: streamlit run dashboard.py
"""

import tempfile
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
import streamlit as st

from backtester import Backtester, BacktestConfig
from data_processor import DataProcessor
from ingest import build_time_series, load_ebay_sold, load_ebay_active
from simulator import run_portfolio_monte_carlo, PortfolioSimulatorConfig

st.set_page_config(page_title="Simulation Outcomes", layout="wide")
st.title("Trading Card Market-Making — Simulation Dashboard")

if "backtest_metrics" not in st.session_state:
    st.session_state.backtest_metrics = None
if "mc_result" not in st.session_state:
    st.session_state.mc_result = None

# Sidebar: inputs
st.sidebar.header("Inputs")
sku = st.sidebar.text_input("SKU label", value="2024 Anthony Edwards Prizm PSA 10", help="e.g. card name for display")

st.sidebar.subheader("Backtest")
sold_file = st.sidebar.file_uploader("Sold listings (JSON)", type=["json"], key="sold")
active_file = st.sidebar.file_uploader("Active listings (JSON, optional)", type=["json"], key="active")
use_sample = st.sidebar.checkbox("Use sample data if no file", value=True)
initial_cash = st.sidebar.number_input("Initial cash ($)", min_value=1000, value=100_000, step=10_000)
spread_bps = st.sidebar.number_input("Spread (bps)", min_value=50, value=200, step=50, help="200 = 2%")

st.sidebar.subheader("Monte Carlo (portfolio)")
num_paths = st.sidebar.number_input("Paths", min_value=100, value=10_000, step=1000, help="Number of simulations")
mc_seed = st.sidebar.number_input("Seed (0 = random)", value=42, min_value=0)
extra_sold = st.sidebar.file_uploader("Extra Sold JSONs (one per SKU, for portfolio)", type=["json"], key="sold_mc", accept_multiple_files=True)

# Resolve sold data
sold_path = None
if sold_file is not None:
    with tempfile.NamedTemporaryFile(suffix=".json", delete=False) as f:
        f.write(sold_file.getvalue())
        sold_path = f.name
elif use_sample:
    sample = Path(__file__).parent / "data" / "sample_sold.json"
    if sample.exists():
        sold_path = str(sample)

active_path = None
if active_file is not None:
    with tempfile.NamedTemporaryFile(suffix=".json", delete=False) as f:
        f.write(active_file.getvalue())
        active_path = f.name

# Build portfolio SKU paths for Monte Carlo: primary sold + extra files (one label per file)
sku_paths = {}
if sold_path:
    sku_paths[sku] = sold_path
for f in extra_sold or []:
    with tempfile.NamedTemporaryFile(suffix=".json", delete=False) as tmp:
        tmp.write(f.getvalue())
        sku_paths[Path(f.name).stem or f"SKU_{len(sku_paths)}"] = tmp.name

# Tabs: Backtest | Monte Carlo
tab1, tab2, tab3 = st.tabs(["Backtest", "Monte Carlo", "Summary"])

with tab1:
    st.header("Backtest: Equity Curve vs Hold")
    if sold_path is None:
        st.info("Upload a Sold listings JSON or check 'Use sample data' to run the backtest.")
    else:
        if st.button("Run backtest", key="run_bt"):
            with st.spinner("Running backtest…"):
                try:
                    sold_df = load_ebay_sold(sold_path)
                    active_df = load_ebay_active(active_path) if active_path and Path(active_path).exists() else None
                    ts_df = build_time_series(sold_df, active_df)
                    if ts_df.empty:
                        ts_df = pd.DataFrame({
                            "date": pd.date_range(start="2024-01-01", periods=90, freq="D"),
                            "fill_price": 100.0,
                            "fill_volume": 1,
                            "best_ask": 102.0,
                            "volume": 1,
                        })
                    config = BacktestConfig(initial_cash=initial_cash, spread_bps=spread_bps)
                    bt = Backtester(config)
                    bt.ingest(ts_df)
                    st.session_state.backtest_metrics = bt.run()
                except Exception as e:
                    st.error(str(e))

        metrics = st.session_state.backtest_metrics
        if metrics is not None:
            c1, c2, c3, c4, c5 = st.columns(5)
            c1.metric("Total PnL", f"${metrics.total_pnl:,.0f}", delta=None)
            c2.metric("Sharpe Ratio", f"{metrics.sharpe_ratio:.3f}", None)
            c3.metric("Max Drawdown", f"{metrics.max_drawdown_pct:.2f}%", None)
            c4.metric("Inventory Risk", f"${metrics.inventory_risk_cost:,.0f}", None)
            c5.metric("Trades / Win rate", f"{metrics.num_trades} / {metrics.win_rate_pct:.1f}%", None)
            if len(metrics.equity_curve) > 0 and len(metrics.hold_curve) > 0:
                df_curve = pd.DataFrame({
                    "Market-making": metrics.equity_curve,
                    "Hold": metrics.hold_curve,
                })
                st.line_chart(df_curve)

with tab2:
    st.header("Monte Carlo: Portfolio Outcome Distribution")
    if not sku_paths:
        st.info("Upload at least one Sold JSON (or use sample data) so the portfolio has at least one SKU. Add extra Sold files for more SKUs.")
    else:
        if st.button("Run Monte Carlo", key="run_mc"):
            with st.spinner(f"Running {num_paths:,} paths…"):
                try:
                    proc = DataProcessor()
                    sku_params = proc.ingest_files(sku_paths)
                    if not sku_params:
                        st.error("No valid SKU data: ensure Sold JSONs have price and timestamp and pass outlier cleaning.")
                    else:
                        config = PortfolioSimulatorConfig(
                            initial_capital=initial_cash,
                            num_paths=int(num_paths),
                            num_days=252,
                            sku_params=sku_params,
                            seed=int(mc_seed) if mc_seed else None,
                        )
                        st.session_state.mc_result = run_portfolio_monte_carlo(config)
                except Exception as e:
                    st.error(str(e))

    result = st.session_state.mc_result
    if result is not None:
        col1, col2, col3, col4, col5 = st.columns(5)
        col1.metric("Mean outcome", f"${result['mean']:,.0f}", None)
        col2.metric("Std", f"${result['std']:,.0f}", None)
        col3.metric("Probability of Ruin", f"{result['probability_of_ruin']:.1%}", None)
        col4.metric("Ruin (staleness)", f"{result['probability_of_ruin_staleness']:.1%}", None)
        col5.metric("SKUs", result.get("num_skus", "-"), None)
        st.caption("Percentiles")
        st.write(f"5th: ${result['p5']:,.0f}  |  50th: ${result['p50']:,.0f}  |  95th: ${result['p95']:,.0f}")
        final_values = result["final_values"]
        fig, ax = plt.subplots(figsize=(10, 4))
        ax.hist(final_values, bins=60, density=True, alpha=0.7, color="steelblue", edgecolor="white")
        ax.axvline(result["mean"], color="red", ls="--", lw=2, label=f"Mean = ${result['mean']:,.0f}")
        ax.set_xlabel("Ending portfolio value ($)")
        ax.set_ylabel("Density")
        ax.set_title("Aggregate portfolio PnL (all SKUs, with staleness)")
        ax.legend()
        ax.grid(True, alpha=0.3)
        st.pyplot(fig)
        plt.close(fig)

with tab3:
    st.header("Summary")
    st.markdown("""
    - **Backtest**: Uses eBay Sold (and optional Active) JSON to build a time series. Simulates a synthetic order book (Active = Ask, Sold = fills), runs market-making vs buy-and-hold, and reports PnL, Sharpe, Max Drawdown, and Inventory Risk.
    - **Monte Carlo**: Vectorized portfolio simulation over all SKUs (one Sold JSON per SKU). Uses per-SKU μ, σ and liquidity from eBay Sold history; correlated GBM; staleness (volume below threshold). Outcome distribution = aggregate PnL; Ruin = % paths &lt; 50% initial value; Ruin (staleness) = % of those ruin paths where illiquidity contributed.
    """)
    st.caption("Data: upload your eBay API JSON (Sold/Active) or use sample data. Run each tab to refresh outcomes.")
