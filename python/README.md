# Trading Card Market-Making Backtest Engine

Python-based backtesting and Monte Carlo simulation for a market-making strategy on trading cards using eBay API data. Captures bid-ask spread via limit orders and models **time arbitrage** (buy undervalued physical assets, list as liquid SKU-based exposure).

## Setup

```bash
cd python
python3 -m pip install -r requirements.txt
```

## Dashboard (visualize outcomes)

From the `python` directory:

```bash
streamlit run dashboard.py
```

Then open the URL shown (e.g. http://localhost:8501). You can:

- **Backtest**: Upload Sold (and optional Active) JSON or use sample data, set initial cash and spread, then click **Run backtest**. View the **equity curve** (market-making vs hold) and metrics (PnL, Sharpe, Max Drawdown, Inventory Risk, Trades / Win rate).
- **Monte Carlo**: Set number of paths and seed, click **Run Monte Carlo**. View the **distribution** of ending portfolio values, mean/std, percentiles, and **Probability of Ruin** (equity and staleness).
- **Summary**: Short description of both runs.

## eBay Data Format

Provide JSON from your eBay API:

- **Sold listings**: array of objects with at least `price` and a date field (`soldDate`, `endTime`, `item_end_date`, or `ended_at`). Optional: `itemId`, `title`.
- **Active listings** (optional): same shape; used as the **Ask** side of the synthetic order book.

Example `sold.json`:

```json
[
  { "itemId": "1", "price": 95, "soldDate": "2024-01-15T12:00:00Z", "title": "2024 Anthony Edwards Prizm PSA 10" },
  { "itemId": "2", "price": 102, "soldDate": "2024-01-18T14:30:00Z", "title": "2024 Anthony Edwards Prizm PSA 10" }
]
```

## CLI

### Backtest (eBay historical Sold / Active)

Use `python3` if `python` is not found (common on macOS). Examples:

```bash
# Using sample data (required args only)
python3 cli.py backtest --sku "2024 Anthony Edwards Prizm PSA 10" --sold data/sample_sold.json

# Save equity curve plot
python3 cli.py backtest --sku "2024 Anthony Edwards Prizm PSA 10" --sold data/sample_sold.json --out equity.png

# With Active listings (optional)
python3 cli.py backtest --sku "2024 Anthony Edwards Prizm PSA 10" --sold path/to/sold.json --active path/to/active.json --out equity.png
```

Output: **Total PnL**, **Sharpe Ratio**, **Max Drawdown %**, **Inventory Risk** (cost of holding stale cards), **Trades** and **Win rate**. Saves an **equity curve** plot (market-making vs hold) to `--out`.

### Monte Carlo (10k paths)

```bash
python3 cli.py monte-carlo --paths 10000 --out dist.png
```

Runs 10,000 iterations with:
- **GBM** price paths + **liquidity shock** (e.g. athlete injury: sudden volume/price drop)
- Randomized **spread**, **eBay FVF** (0% vs standard), and **shipping/grading friction**
- **Distribution** of ending portfolio values and **Probability of Ruin** (equity threshold + inventory staleness)

### Full run (backtest + Monte Carlo + plots)

```bash
python3 cli.py full --sku "2024 Anthony Edwards Prizm PSA 10" --sold data/sample_sold.json --out-dir outputs
```

Writes `equity_<sku>.png` and `monte_carlo_<sku>.png` into `outputs/`.

## Modules

| Module | Role |
|--------|------|
| `ingest.py` | Load eBay Sold/Active JSON → time-series DataFrame |
| `backtester.py` | `Backtester`: synthetic order book, `simulate_fill()`, PnL, Sharpe, Max DD, Inventory Risk |
| `simulator.py` | `MarketSimulator`: GBM + liquidity shock, 10k paths, outcome distribution, Probability of Ruin |
| `viz.py` | Equity curve (MM vs Hold), Monte Carlo histogram |
| `cli.py` | CLI: `backtest`, `monte-carlo`, `full` |

## Metrics

- **PnL**: Realized + unrealized from simulated fills.
- **Sharpe Ratio**: Annualized (daily returns, √252).
- **Max Drawdown**: Peak-to-trough decline in equity.
- **Inventory Risk**: Cost of holding physical cards that don’t flip (staleness penalty).
- **Probability of Ruin**: Fraction of Monte Carlo paths below an equity threshold or with inventory stale beyond a day limit.
