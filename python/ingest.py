"""
eBay data ingestion: convert Sold and Active listings (JSON from eBay API) into
a time-series DataFrame for the backtester.
"""

from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd


def _safe_float(x: Any, default: float = np.nan) -> float:
    if x is None:
        return default
    if isinstance(x, (int, float)) and not np.isnan(x):
        return float(x)
    if isinstance(x, str):
        x = x.replace(",", "").replace("$", "").strip()
        try:
            return float(x)
        except ValueError:
            pass
    return default


def _safe_ts(x: Any) -> pd.Timestamp | None:
    if x is None:
        return None
    if isinstance(x, (int, float)):
        return pd.to_datetime(x, unit="s" if x > 1e10 else "D", utc=True)
    try:
        return pd.Timestamp(x, tz="UTC")
    except Exception:
        return None


def load_ebay_sold(sold_path: str | Path) -> pd.DataFrame:
    """
    Load eBay 'Sold' listings JSON into a DataFrame.
    Expected structure: list of items with at least price and date (sold/end time).
    """
    path = Path(sold_path)
    data = _load_json(path)
    rows = []
    items = (
        data
        if isinstance(data, list)
        else data.get("items")
        or data.get("sold")
        or data.get("search_results")
        or data.get("item", [])
    )
    if items is None:
        items = []

    for item in items:
        if not isinstance(item, dict):
            continue
        price = _safe_float(
            item.get("price")
            or item.get("currentPrice")
            or (item.get("price", {}) or {}).get("value")
        )
        if np.isnan(price) or price <= 0:
            continue
        ts = _safe_ts(
            item.get("soldDate")
            or item.get("endTime")
            or item.get("item_end_date")
            or item.get("ended_at")
        )
        if ts is None:
            continue
        rows.append(
            {
                "timestamp": ts,
                "price": price,
                "side": "fill",
                "listing_id": item.get("itemId") or item.get("item_id"),
                "title": item.get("title"),
            }
        )

    if not rows:
        return pd.DataFrame(columns=["timestamp", "price", "side", "listing_id", "title"])

    df = pd.DataFrame(rows)
    df = df.sort_values("timestamp").reset_index(drop=True)
    return df


def load_ebay_active(active_path: str | Path) -> pd.DataFrame:
    """
    Load eBay 'Active' listings JSON into a DataFrame (represents Ask side).
    Snapshot-style: each row is an ask; optional timestamp for time-series.
    """
    path = Path(active_path)
    data = _load_json(path)
    rows = []
    items = (
        data
        if isinstance(data, list)
        else data.get("items")
        or data.get("active")
        or data.get("search_results")
        or data.get("item", [])
    )
    if items is None:
        items = []

    for item in items:
        if not isinstance(item, dict):
            continue
        price = _safe_float(
            item.get("price")
            or item.get("currentPrice")
            or (item.get("price", {}) or {}).get("value")
        )
        if np.isnan(price) or price <= 0:
            continue
        ts = _safe_ts(
            item.get("startTime")
            or item.get("listedAt")
            or item.get("timestamp")
        ) or pd.Timestamp.now(tz="UTC")
        rows.append(
            {
                "timestamp": ts,
                "price": price,
                "side": "ask",
                "listing_id": item.get("itemId") or item.get("item_id"),
                "title": item.get("title"),
            }
        )

    if not rows:
        return pd.DataFrame(columns=["timestamp", "price", "side", "listing_id", "title"])

    df = pd.DataFrame(rows)
    df = df.sort_values("timestamp").reset_index(drop=True)
    return df


def _load_json(path: Path) -> Any:
    import json

    with open(path, encoding="utf-8") as f:
        return json.load(f)


def build_time_series(
    sold_df: pd.DataFrame,
    active_df: pd.DataFrame | None = None,
    freq: str = "D",
) -> pd.DataFrame:
    """
    Build a single time-series DataFrame for the backtester:
    - Fills (sold) with timestamp and price.
    - Optional: snapshots of best ask (min active price per period).
    """
    if sold_df.empty:
        return pd.DataFrame(
            columns=["timestamp", "fill_price", "fill_volume", "best_ask", "volume"]
        )

    sold_df = sold_df.rename(columns={"price": "fill_price"})
    sold_df["fill_volume"] = 1
    sold_df["timestamp"] = pd.to_datetime(sold_df["timestamp"], utc=True)

    agg = sold_df.set_index("timestamp").resample(freq).agg(
        fill_price=("fill_price", "mean"),
        fill_volume=("fill_volume", "sum"),
    ).dropna(how="all")

    if active_df is not None and not active_df.empty:
        active_df = active_df.copy()
        active_df["timestamp"] = pd.to_datetime(active_df["timestamp"], utc=True)
        ask_agg = active_df.set_index("timestamp").resample(freq).agg(
            best_ask=("price", "min"),
            volume=("price", "count"),
        )
        agg = agg.join(ask_agg, how="left")

    agg = agg.reset_index()
    agg = agg.rename(columns={"timestamp": "date"})
    return agg
