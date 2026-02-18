"""
DataProcessor: multi-SKU eBay Sold ingestion, price cleaning, and per-SKU
historical mu (mean daily return), sigma (volatility), liquidity_score.
"""

from pathlib import Path

import numpy as np
import pandas as pd

from ingest import load_ebay_sold


def clean_sold_prices(
    prices: np.ndarray,
    min_price: float = 5.0,
    iqr_mult: float = 1.5,
    percentile_floor: float = 1.0,
) -> np.ndarray:
    """
    Remove outliers from eBay Sold prices (e.g. $1 auctions, errors).
    - Drop prices below min_price (non-representative of market).
    - Drop below percentile_floor percentile of data.
    - Drop outside IQR: keep within [Q1 - iqr_mult*IQR, Q3 + iqr_mult*IQR].
    """
    p = np.asarray(prices, dtype=float)
    p = p[np.isfinite(p) & (p >= min_price)]
    if p.size == 0:
        return p
    if p.size <= 2:
        return p
    q1, q3 = np.percentile(p, [25, 75])
    iqr = q3 - q1
    if iqr <= 0:
        iqr = np.std(p) or 1e-6
    low = max(min_price, np.percentile(p, percentile_floor), q1 - iqr_mult * iqr)
    high = q3 + iqr_mult * iqr
    return p[(p >= low) & (p <= high)]


def prices_to_daily_returns(prices: np.ndarray) -> np.ndarray:
    """Assume prices are time-ordered; compute log returns. Length = len(prices)-1."""
    p = np.asarray(prices, dtype=float)
    if p.size < 2:
        return np.array([])
    return np.diff(np.log(p))


def annualize_daily_stats(daily_log_returns: np.ndarray) -> tuple[float, float]:
    """Return (annualized mu, annualized sigma). mu = mean(r)*252, sigma = std(r)*sqrt(252)."""
    r = np.asarray(daily_log_returns, dtype=float)
    r = r[np.isfinite(r)]
    if r.size == 0:
        return 0.0, 0.25
    mu = float(np.mean(r)) * 252
    sigma = float(np.std(r)) * np.sqrt(252)
    if sigma <= 0 or not np.isfinite(sigma):
        sigma = 0.25
    return mu, sigma


def liquidity_score_from_sales(num_sales: int, span_days: float) -> float:
    """
    Sales per month, normalized to a 0-1 score (e.g. 1 sale/month -> low, 30+/month -> high).
    """
    if span_days <= 0:
        return 0.0
    sales_per_month = num_sales / (span_days / 30.0) if span_days else 0
    # Soft cap: 10+ sales/month -> score 1; 0 -> 0
    return float(np.clip(sales_per_month / 10.0, 0.0, 1.0))


def process_sku_sold(sold_df: pd.DataFrame) -> dict[str, float] | None:
    """
    From a single SKU's Sold DataFrame (columns: timestamp, price), compute
    mu, sigma, liquidity_score after cleaning. Return None if insufficient data.
    """
    if sold_df.empty or "price" not in sold_df.columns:
        return None
    prices = sold_df["price"].values
    prices = clean_sold_prices(prices)
    if prices.size < 2:
        return None
    returns = prices_to_daily_returns(prices)
    if returns.size < 1:
        return None
    mu, sigma = annualize_daily_stats(returns)
    sold_df_sorted = sold_df.sort_values("timestamp")
    ts = pd.to_datetime(sold_df_sorted["timestamp"], utc=True)
    span_days = (ts.max() - ts.min()).total_seconds() / 86400.0 if len(ts) > 1 else 0
    span_days = max(span_days, 1.0)
    liquidity = liquidity_score_from_sales(len(prices), span_days)
    return {"mu": mu, "sigma": sigma, "liquidity_score": liquidity, "n_observations": int(prices.size)}


class DataProcessor:
    """
    Handles multiple JSON files (one per SKU), computes per-SKU mu, sigma, liquidity_score.
    Output: { 'SKU_Label': {'mu': float, 'sigma': float, 'liquidity_score': float}, ... }
    """

    def __init__(
        self,
        min_price: float = 5.0,
        iqr_mult: float = 1.5,
    ):
        self.min_price = min_price
        self.iqr_mult = iqr_mult
        self._sku_params: dict[str, dict[str, float]] = {}

    def ingest_files(self, sku_paths: dict[str, str | Path]) -> dict[str, dict[str, float]]:
        """
        sku_paths: { 'SKU_Label': path_to_sold_json, ... }
        Returns: { 'SKU_Label': {'mu': float, 'sigma': float, 'liquidity_score': float}, ... }
        """
        self._sku_params = {}
        for sku, path in sku_paths.items():
            path = Path(path)
            if not path.exists():
                continue
            sold_df = load_ebay_sold(path)
            if sold_df.empty:
                continue
            if "price" not in sold_df.columns and "fill_price" in sold_df.columns:
                sold_df = sold_df.rename(columns={"fill_price": "price"})
            if "timestamp" not in sold_df.columns and "date" in sold_df.columns:
                sold_df = sold_df.rename(columns={"date": "timestamp"})
            params = process_sku_sold(sold_df)
            if params is not None:
                self._sku_params[sku] = {
                    "mu": params["mu"],
                    "sigma": params["sigma"],
                    "liquidity_score": params["liquidity_score"],
                }
        return self._sku_params

    def ingest_dataframes(self, sku_dfs: dict[str, pd.DataFrame]) -> dict[str, dict[str, float]]:
        """
        sku_dfs: { 'SKU_Label': sold_DataFrame with 'price' and 'timestamp', ... }
        """
        self._sku_params = {}
        for sku, df in sku_dfs.items():
            if df.empty:
                continue
            params = process_sku_sold(df)
            if params is not None:
                self._sku_params[sku] = {
                    "mu": params["mu"],
                    "sigma": params["sigma"],
                    "liquidity_score": params["liquidity_score"],
                }
        return self._sku_params

    @property
    def sku_params(self) -> dict[str, dict[str, float]]:
        """{ 'SKU_Label': {'mu': float, 'sigma': float, 'liquidity_score': float} }"""
        return self._sku_params
