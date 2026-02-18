"""
Monte Carlo MarketSimulator: vectorized portfolio simulation over multiple SKUs.
GBM price paths with correlated returns (market factor + idiosyncratic), liquidity
(staleness) constraints, and Probability of Ruin (equity and staleness).
"""

from dataclasses import dataclass, field
from typing import Optional

import numpy as np


@dataclass
class SimulatorConfig:
    """Inputs for the Monte Carlo runs (single-SKU legacy)."""
    initial_capital: float = 100_000.0
    num_days: int = 252
    num_paths: int = 10_000
    mu: float = 0.05
    sigma: float = 0.35
    liquidity_shock_prob: float = 0.02
    liquidity_shock_drop_pct: float = 0.25
    spread_bps_range: tuple[float, float] = (100.0, 400.0)
    fee_bps_range: tuple[float, float] = (0.0, 125.0)
    friction_bps_range: tuple[float, float] = (25.0, 75.0)
    ruin_threshold_pct: float = -0.50
    staleness_ruin_days: int = 180
    seed: Optional[int] = None


@dataclass
class PortfolioSimulatorConfig:
    """Inputs for vectorized portfolio Monte Carlo."""
    initial_capital: float = 100_000.0
    num_days: int = 252
    num_paths: int = 10_000
    # sku_params: { 'SKU': {'mu': float, 'sigma': float, 'liquidity_score': float} }
    sku_params: dict = field(default_factory=dict)
    # Initial price per SKU (default 100 if not provided)
    s0_per_sku: Optional[dict[str, float]] = None
    # Market factor: Z_k = market_beta * Z_m + sqrt(1 - market_beta^2) * Z_idio
    market_beta: float = 0.5
    # Staleness: volume_t = liquidity_score * exp(vol_volatility * Z); if volume < threshold for > N days, haircut
    volume_threshold: float = 0.1
    staleness_ruin_days: int = 180
    staleness_haircut: float = 0.0  # 0 = total write-off when stale
    ruin_pct: float = 0.5  # ruin = final value < ruin_pct * initial
    seed: Optional[int] = None


def run_portfolio_monte_carlo(config: PortfolioSimulatorConfig) -> dict:
    """
    Vectorized Monte Carlo for the entire portfolio (no for-loop over paths).
    - Correlated returns via market factor + idiosyncratic shocks.
    - GBM: S_t = S_{t-1} * exp((mu - 0.5*sigma^2)*dt + sigma*sqrt(dt)*Z).
    - Staleness: simulated daily volume < threshold for > N days -> haircut; ruin (staleness) = % paths where final value < 50% initial (with haircuts).
    Returns dict with final_values, mean, std, percentiles, probability_of_ruin, probability_of_ruin_staleness.
    """
    rng = np.random.default_rng(config.seed)
    P = config.num_paths
    T = config.num_days
    sku_params = config.sku_params
    if not sku_params:
        # Fallback single-SKU from legacy config-style defaults
        sku_params = {"Default": {"mu": 0.05, "sigma": 0.35, "liquidity_score": 0.5}}
    labels = list(sku_params.keys())
    K = len(labels)
    dt = 1.0 / 252.0
    sqrt_dt = np.sqrt(dt)

    mu_arr = np.array([sku_params[s]["mu"] for s in labels], dtype=float)
    sigma_arr = np.array([sku_params[s]["sigma"] for s in labels], dtype=float)
    liq_arr = np.array([sku_params[s]["liquidity_score"] for s in labels], dtype=float)
    # Clamp sigma to avoid zeros
    sigma_arr = np.maximum(sigma_arr, 1e-6)

    s0 = np.array(
        [config.s0_per_sku.get(s, 100.0) for s in labels],
        dtype=float,
    ) if config.s0_per_sku else np.full(K, 100.0)

    # Equal-weight portfolio: initial value per SKU
    initial_per_sku = config.initial_capital / K
    shares = initial_per_sku / s0  # (K,)

    # --- Correlated normal shocks (P, T, K) ---
    Z_market = rng.standard_normal((P, T))
    Z_idio = rng.standard_normal((P, T, K))
    beta = np.clip(config.market_beta, 0.0, 1.0)
    Z = beta * Z_market[:, :, np.newaxis] + np.sqrt(1.0 - beta**2) * Z_idio  # (P, T, K)

    # --- GBM: (P, T+1, K) ---
    drift = (mu_arr - 0.5 * sigma_arr**2) * dt
    vol = sigma_arr * sqrt_dt
    log_returns = drift + vol * Z  # (P, T, K)
    S = np.zeros((P, T + 1, K))
    S[:, 0, :] = s0
    S[:, 1:, :] = s0 * np.exp(np.cumsum(log_returns, axis=1))

    # --- Simulated daily volume (P, T, K): liquidity * exp(noise) ---
    Z_vol = rng.standard_normal((P, T, K))
    volume = liq_arr[np.newaxis, np.newaxis, :] * np.exp(0.3 * Z_vol)

    # --- Staleness: for each (path, sku) count consecutive days below threshold at END of path ---
    below = volume < config.volume_threshold  # (P, T, K)
    flipped_below = np.flip(below.astype(np.float64), axis=1)
    first_above_idx = np.argmin(flipped_below, axis=1)  # (P, K)
    all_below = np.min(flipped_below, axis=1) == 1.0
    days_stale_at_end = np.where(all_below, T, first_above_idx).astype(int)  # (P, K)
    is_stale = days_stale_at_end >= config.staleness_ruin_days  # (P, K)
    haircut = np.where(is_stale, config.staleness_haircut, 1.0)  # (P, K)

    # --- Portfolio value at end (with staleness haircut) ---
    end_prices = S[:, -1, :]  # (P, K)
    value_per_sku = shares[np.newaxis, :] * end_prices * haircut  # (P, K)
    final_values = np.sum(value_per_sku, axis=1)  # (P,)

    # --- Ruin: final value < ruin_pct * initial ---
    ruin_threshold = config.initial_capital * config.ruin_pct
    probability_of_ruin = float(np.mean(final_values < ruin_threshold))
    # Ruin (staleness): ruin paths where at least one SKU was stale
    ruin_paths = final_values < ruin_threshold
    had_stale = np.any(is_stale, axis=1)  # (P,)
    probability_of_ruin_staleness = float(np.mean(ruin_paths & had_stale))

    return {
        "final_values": final_values,
        "mean": float(np.mean(final_values)),
        "std": float(np.std(final_values)),
        "p5": float(np.percentile(final_values, 5)),
        "p50": float(np.percentile(final_values, 50)),
        "p95": float(np.percentile(final_values, 95)),
        "probability_of_ruin": probability_of_ruin,
        "probability_of_ruin_staleness": probability_of_ruin_staleness,
        "staleness_days_threshold": config.staleness_ruin_days,
        "num_skus": K,
        "sku_labels": labels,
    }


class MarketSimulator:
    """
    Legacy single-SKU loop-based simulator. For portfolio runs use
    run_portfolio_monte_carlo(PortfolioSimulatorConfig(...)).
    """

    def __init__(self, config: Optional[SimulatorConfig] = None):
        self.config = config or SimulatorConfig()
        self._rng = np.random.default_rng(self.config.seed)
        self._final_values: np.ndarray = np.array([])
        self._ruin_count = 0
        self._staleness_ruin_count = 0

    def _gbm_path(
        self,
        S0: float,
        T: int,
        mu: float,
        sigma: float,
        liquidity_shock: bool,
        shock_drop: float,
    ) -> np.ndarray:
        """Single price path: GBM with optional one-time liquidity shock (drop)."""
        dt = 1.0 / 252.0
        path = np.zeros(T + 1)
        path[0] = S0
        shock_day = self._rng.integers(1, T) if liquidity_shock else -1
        for t in range(1, T + 1):
            z = self._rng.standard_normal()
            path[t] = path[t - 1] * np.exp(
                (mu - 0.5 * sigma**2) * dt + sigma * np.sqrt(dt) * z
            )
            if t == shock_day:
                path[t] *= 1.0 - shock_drop
        return path

    def _run_single_path(
        self,
        price_path: np.ndarray,
        spread_bps: float,
        fee_bps: float,
        friction_bps: float,
    ) -> tuple[float, int]:
        """Simulate MM: quote bid/ask around mid; track staleness."""
        capital = self.config.initial_capital
        position = 0
        cost_basis = 0.0
        max_stale_days = 0
        current_stale = 0
        fee_mult = 1.0 - (fee_bps + friction_bps) / 10_000
        spread_mult = spread_bps / 10_000
        unit_size = 10.0

        for t in range(1, len(price_path)):
            mid = price_path[t]
            bid = mid * (1 - spread_mult / 2)
            ask = mid * (1 + spread_mult / 2)

            if position > 0:
                current_stale += 1
                max_stale_days = max(max_stale_days, current_stale)
                if mid >= ask:
                    proceeds = ask * fee_mult * position
                    capital += proceeds
                    position = 0
                    cost_basis = 0.0
                    current_stale = 0
            else:
                if mid <= bid and capital >= unit_size:
                    cost = bid / fee_mult
                    position = min(1.0, capital / cost)
                    cost_basis = cost * position
                    capital -= cost_basis
                    current_stale = 0

        final_equity = capital + position * price_path[-1]
        return final_equity, max_stale_days

    def run(self) -> dict:
        """Legacy: run num_paths loop-based single-SKU simulations."""
        n = self.config.num_paths
        T = self.config.num_days
        S0 = 100.0
        mu = self.config.mu
        sigma = self.config.sigma
        p_shock = self.config.liquidity_shock_prob
        shock_drop = self.config.liquidity_shock_drop_pct
        ruin_threshold = self.config.initial_capital * (1.0 + self.config.ruin_threshold_pct)
        staleness_days = self.config.staleness_ruin_days

        final_values = np.zeros(n)
        staleness_counts = np.zeros(n, dtype=int)

        for i in range(n):
            liquidity_shock = self._rng.random() < p_shock
            spread_bps = self._rng.uniform(*self.config.spread_bps_range)
            fee_bps = self._rng.uniform(*self.config.fee_bps_range)
            friction_bps = self._rng.uniform(*self.config.friction_bps_range)

            path = self._gbm_path(S0, T, mu, sigma, liquidity_shock, shock_drop)
            fv, stale = self._run_single_path(path, spread_bps, fee_bps, friction_bps)
            final_values[i] = fv
            staleness_counts[i] = stale

        self._final_values = final_values
        self._ruin_count = int(np.sum(final_values <= ruin_threshold))
        self._staleness_ruin_count = int(np.sum(staleness_counts >= staleness_days))

        return {
            "final_values": final_values,
            "mean": float(np.mean(final_values)),
            "std": float(np.std(final_values)),
            "p5": float(np.percentile(final_values, 5)),
            "p50": float(np.percentile(final_values, 50)),
            "p95": float(np.percentile(final_values, 95)),
            "probability_of_ruin": self._ruin_count / n,
            "probability_of_ruin_staleness": self._staleness_ruin_count / n,
            "staleness_days_threshold": staleness_days,
        }
