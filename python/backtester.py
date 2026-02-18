"""
Backtester for market-making on trading cards (eBay gallery-style marketplace).
Simulates synthetic order book (Active = Ask, Sold = historical Fills), execution logic,
and metrics: PnL, Sharpe, Max Drawdown, Inventory Risk.
"""

from dataclasses import dataclass, field
from typing import Optional

import numpy as np
import pandas as pd


@dataclass
class BacktestConfig:
    """Parameters for the backtest."""
    initial_cash: float = 100_000.0
    spread_bps: float = 200.0  # bid-ask spread in basis points (200 = 2%)
    position_limit: int = 10
    fee_bps: float = 125.0  # eBay FVF ~12.5%
    friction_bps: float = 50.0  # shipping/grading friction
    fill_proximity_pct: float = 0.02  # bid/ask within 2% of touch to count as fill
    volume_scale: float = 1.0  # scale historical volume for fill probability


@dataclass
class BacktestMetrics:
    """Output metrics from the backtest."""
    total_pnl: float = 0.0
    sharpe_ratio: float = 0.0
    max_drawdown_pct: float = 0.0
    inventory_risk_cost: float = 0.0  # cost of holding stale inventory
    num_trades: int = 0
    win_rate_pct: float = 0.0
    equity_curve: np.ndarray = field(default_factory=lambda: np.array([]))
    hold_curve: np.ndarray = field(default_factory=lambda: np.array([]))


class Backtester:
    """
    Backtest model: ingest eBay Sold/Active → time-series, simulate order book,
    simulate_fill() for execution, compute PnL, Sharpe, Max DD, Inventory Risk.
    """

    def __init__(self, config: Optional[BacktestConfig] = None):
        self.config = config or BacktestConfig()
        self._ts: Optional[pd.DataFrame] = None
        self._fills: list[dict] = []
        self._positions: list[dict] = []
        self._cash: float = self.config.initial_cash
        self._equity_curve: list[float] = []

    def ingest(self, ts_df: pd.DataFrame) -> None:
        """
        Ingest time-series from ingest.build_time_series().
        ts_df must have: date, fill_price, fill_volume; optional best_ask, volume.
        """
        ts_df = ts_df.copy()
        ts_df["date"] = pd.to_datetime(ts_df["date"])
        if "best_ask" not in ts_df.columns:
            ts_df["best_ask"] = ts_df.get("fill_price", np.nan)
        if "volume" not in ts_df.columns:
            ts_df["volume"] = ts_df.get("fill_volume", 1.0)
        self._ts = ts_df.sort_values("date").reset_index(drop=True)
        self._fills = []
        self._positions = []
        self._cash = self.config.initial_cash
        self._equity_curve = []

    def _synthetic_order_book(self, row: pd.Series, date: pd.Timestamp) -> tuple[float, float]:
        """
        Simulate order book at this date: best_ask from Active (row), bid = ask - spread.
        """
        ask = float(row.get("best_ask", row.get("fill_price", np.nan)))
        if np.isnan(ask):
            return np.nan, np.nan
        spread = ask * (self.config.spread_bps / 10_000)
        bid = ask - spread
        return bid, ask

    def simulate_fill(
        self,
        side: str,
        price: float,
        row: pd.Series,
        date: pd.Timestamp,
    ) -> bool:
        """
        Determine if a bid (buy) or ask (sell) would have been filled given
        historical volume and price proximity.
        - Buy: fill if our bid >= fill_price - proximity * fill_price and volume > 0.
        - Sell: fill if our ask <= fill_price + proximity * fill_price and volume > 0.
        """
        fill_price = float(row.get("fill_price", np.nan))
        volume = float(row.get("fill_volume", 1.0)) * self.config.volume_scale
        if np.isnan(fill_price) or volume <= 0:
            return False
        proximity = self.config.fill_proximity_pct
        if side == "buy":
            return price >= fill_price * (1 - proximity)
        if side == "sell":
            return price <= fill_price * (1 + proximity)
        return False

    def run(self) -> BacktestMetrics:
        """Run backtest over ingested time-series; return metrics."""
        if self._ts is None or self._ts.empty:
            return BacktestMetrics()

        ts = self._ts
        cash = self.config.initial_cash
        position = 0
        cost_basis = 0.0
        equity_curve = [cash]
        first_fill_price = float(ts.iloc[0].get("fill_price", np.nan))
        if np.isnan(first_fill_price):
            first_fill_price = 0.0
        hold_cash_after_buy = self.config.initial_cash - first_fill_price if first_fill_price > 0 else self.config.initial_cash
        hold_curve = [self.config.initial_cash]
        trade_pnls: list[float] = []
        peak_equity = cash
        max_dd = 0.0
        inventory_days_stale = 0.0
        total_inventory_risk_cost = 0.0
        fee_mult = 1.0 - (self.config.fee_bps + self.config.friction_bps) / 10_000

        for i in range(len(ts)):
            row = ts.iloc[i]
            date = row["date"]
            fill_price = float(row.get("fill_price", np.nan))
            fill_vol = float(row.get("fill_volume", 1.0))
            bid, ask = self._synthetic_order_book(row, date)

            if np.isnan(bid) or np.isnan(ask):
                mtm = fill_price if not np.isnan(fill_price) else 0.0
                equity_curve.append(cash + position * mtm)
                hold_curve.append(hold_cash_after_buy + (first_fill_price and 1.0 or 0.0) * mtm)
                continue

            # Buy: would our bid get filled?
            if position < self.config.position_limit and self.simulate_fill("buy", bid, row, date):
                cost = fill_price * fee_mult
                if cash >= cost * fill_vol:
                    size = min(int(fill_vol) or 1, self.config.position_limit - position)
                    cash -= cost * size
                    cost_basis += cost * size
                    position += size
                    trade_pnls.append(0.0)
                    inventory_days_stale = 0.0

            # Sell: would our ask get filled?
            if position > 0 and self.simulate_fill("sell", ask, row, date):
                proceeds = fill_price * fee_mult * fill_vol
                size = min(int(fill_vol) or 1, position)
                cash += proceeds * size / max(size, 1)
                pnl = (fill_price - cost_basis / max(position, 1)) * size
                cost_basis -= cost_basis / max(position, 1) * size
                position -= size
                trade_pnls.append(pnl)
                inventory_days_stale = 0.0

            inventory_days_stale += 1
            # Inventory risk: penalize holding stale inventory (e.g. 0.1% per day)
            if position > 0:
                stale_penalty = position * fill_price * 0.001 * min(inventory_days_stale / 30, 1.0)
                total_inventory_risk_cost += stale_penalty
                cash -= stale_penalty

            mtm = fill_price if not np.isnan(fill_price) else 0.0
            equity = cash + position * mtm
            equity_curve.append(equity)
            if equity > peak_equity:
                peak_equity = equity
            dd = (peak_equity - equity) / peak_equity if peak_equity > 0 else 0
            if dd > max_dd:
                max_dd = dd

            # Hold: bought 1 unit at first_fill_price; value = rest of cash + 1 * current price
            hold_curve.append(hold_cash_after_buy + (1.0 if first_fill_price > 0 else 0.0) * mtm)

        returns = np.diff(equity_curve) / (np.array(equity_curve[:-1]) + 1e-12)
        sharpe = (
            (np.mean(returns) / np.std(returns)) * np.sqrt(252)
            if np.std(returns) > 0 else 0.0
        )
        total_pnl = equity_curve[-1] - self.config.initial_cash if equity_curve else 0.0
        wins = [p for p in trade_pnls if p > 0]
        win_rate = (len(wins) / len(trade_pnls) * 100) if trade_pnls else 0.0

        return BacktestMetrics(
            total_pnl=total_pnl,
            sharpe_ratio=float(sharpe),
            max_drawdown_pct=max_dd * 100,
            inventory_risk_cost=total_inventory_risk_cost,
            num_trades=len(trade_pnls),
            win_rate_pct=win_rate,
            equity_curve=np.array(equity_curve),
            hold_curve=np.array(hold_curve),
        )
