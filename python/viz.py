"""
Visualization: equity curve (MM strategy) vs hold strategy.
"""

from pathlib import Path
from typing import Optional

import matplotlib.pyplot as plt
import numpy as np


def plot_equity_vs_hold(
    equity_curve: np.ndarray,
    hold_curve: np.ndarray,
    output_path: Optional[str | Path] = None,
    title: str = "Equity Curve: Market-Making vs Hold",
    sku_label: str = "",
) -> None:
    """
    Plot equity curve (MM strategy) vs hold strategy.
    """
    fig, ax = plt.subplots(figsize=(10, 5))
    x = np.arange(len(equity_curve))
    ax.plot(x, equity_curve, label="Market-making", color="C0", lw=1.5)
    ax.plot(x, hold_curve, label="Hold", color="C1", lw=1.5, alpha=0.8)
    ax.set_xlabel("Time (periods)")
    ax.set_ylabel("Portfolio value ($)")
    ax.set_title(title + (" — " + sku_label if sku_label else ""))
    ax.legend(loc="upper left")
    ax.grid(True, alpha=0.3)
    fig.tight_layout()
    if output_path:
        fig.savefig(output_path, dpi=150)
        plt.close(fig)
    else:
        plt.show()


def plot_monte_carlo_distribution(
    final_values: np.ndarray,
    output_path: Optional[str | Path] = None,
    title: str = "Monte Carlo: Distribution of Ending Portfolio Values",
) -> None:
    """Histogram of final portfolio values from Monte Carlo runs."""
    fig, ax = plt.subplots(figsize=(8, 4))
    ax.hist(final_values, bins=80, density=True, alpha=0.7, color="C0", edgecolor="white")
    ax.axvline(np.mean(final_values), color="red", ls="--", lw=2, label=f"Mean = ${np.mean(final_values):,.0f}")
    ax.set_xlabel("Ending portfolio value ($)")
    ax.set_ylabel("Density")
    ax.set_title(title)
    ax.legend()
    ax.grid(True, alpha=0.3)
    fig.tight_layout()
    if output_path:
        fig.savefig(output_path, dpi=150)
        plt.close(fig)
    else:
        plt.show()
