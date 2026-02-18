"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

const formatPrice = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(n);

interface EbayCategory {
  id: string;
  name: string;
  defaultVolatility?: number;
  defaultDrift?: number;
}

export default function SimulatePage() {
  const [categories, setCategories] = useState<EbayCategory[]>([]);
  const [categoryId, setCategoryId] = useState("");
  const [ebayItemId, setEbayItemId] = useState("");
  const [initialPrice, setInitialPrice] = useState("100");
  const [drift, setDrift] = useState("");
  const [volatility, setVolatility] = useState("");
  const [numPaths, setNumPaths] = useState("5000");
  const [horizonDays, setHorizonDays] = useState("30");
  const [mcResult, setMcResult] = useState<{
    percentiles: { p5: number; p25: number; p50: number; p75: number; p95: number };
    mean: number;
    stdDev: number;
    strategy: { fairValue: number; bid: number; ask: number; spreadPct: number; method: string };
    category: { id: string; name: string } | null;
  } | null>(null);
  const [mcLoading, setMcLoading] = useState(false);
  const [mcError, setMcError] = useState<string | null>(null);

  const [backtestResult, setBacktestResult] = useState<{
    totalPnl: number;
    returnPct: number;
    numBuys: number;
    numSells: number;
    maxDrawdownPct: number;
    winRatePct: number;
    finalCash: number;
    finalPosition: number;
    finalMtM: number;
    category: { id: string | null; name: string } | null;
  } | null>(null);
  const [backtestLoading, setBacktestLoading] = useState(false);
  const [initialCash, setInitialCash] = useState("10000");
  const [categorySampleLoading, setCategorySampleLoading] = useState(false);

  const [historicalSales, setHistoricalSales] = useState<{ date: string; price: number; title?: string }[]>([]);
  const [historicalSummary, setHistoricalSummary] = useState<{
    count: number;
    minDate: string | null;
    maxDate: string | null;
    medianPrice: number;
    category: { id: string; name: string };
  } | null>(null);
  const [historicalLoading, setHistoricalLoading] = useState(false);
  const [backtestOnHistory, setBacktestOnHistory] = useState(false);

  const [buyDiscountResults, setBuyDiscountResults] = useState<
    { sellAfterDays: number; sellTargetPct: number; returnPct: number; totalPnl: number; winRatePct: number; numBuys: number; numSells: number }[]
  >([]);
  const [buyDiscountLoading, setBuyDiscountLoading] = useState(false);
  const [sellAfterDaysInput, setSellAfterDaysInput] = useState("7, 14, 30");
  const [sellTargetPctInput, setSellTargetPctInput] = useState("5, 10, 15");
  const [buyDiscountPctInput, setBuyDiscountPctInput] = useState("10");

  useEffect(() => {
    fetch("/api/ebay/categories")
      .then((res) => res.json())
      .then((data) => setCategories(data.categories ?? []))
      .catch(() => setCategories([]));
  }, []);

  useEffect(() => {
    if (!categoryId || !categories.length) return;
    const cat = categories.find((c) => c.id === categoryId);
    if (!cat) return;
    if (cat.defaultVolatility != null) setVolatility(String(cat.defaultVolatility));
    if (cat.defaultDrift != null) setDrift(String(cat.defaultDrift));
  }, [categoryId, categories]);

  const fetchHistoricalSales = async () => {
    if (!categoryId) return;
    setHistoricalLoading(true);
    setMcError(null);
    setHistoricalSummary(null);
    setHistoricalSales([]);
    try {
      const res = await fetch(
        `/api/ebay/historical-sales?category_id=${encodeURIComponent(categoryId)}`
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Historical sales fetch failed");
      setHistoricalSales(data.sales ?? []);
      setHistoricalSummary({
        count: data.summary?.count ?? 0,
        minDate: data.summary?.minDate ?? null,
        maxDate: data.summary?.maxDate ?? null,
        medianPrice: data.summary?.medianPrice ?? 0,
        category: data.category ?? { id: categoryId, name: "" },
      });
    } catch (e) {
      setMcError(e instanceof Error ? e.message : "Historical sales failed");
    }
    setHistoricalLoading(false);
  };

  const useHistoryForStrategy = async () => {
    if (historicalSales.length === 0) return;
    setMcError(null);
    setMcResult(null);
    setMcLoading(true);
    const comps = historicalSales.map((s, i) => ({
      id: `hist-${i}`,
      cardId: "historical",
      price: s.price,
      soldAt: s.date,
      source: "eBay",
    }));
    try {
      const res = await fetch("/api/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          comps,
          numPaths: parseInt(numPaths, 10) || 5000,
          horizonDays: parseInt(horizonDays, 10) || 30,
          categoryId: categoryId || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Simulation failed");
      setInitialPrice(String(data.monteCarlo.params.initialPrice.toFixed(2)));
      setDrift(String(data.monteCarlo.params.drift));
      setVolatility(String(data.monteCarlo.params.volatility));
      setMcResult({
        percentiles: data.monteCarlo.percentiles,
        mean: data.monteCarlo.mean,
        stdDev: data.monteCarlo.stdDev,
        strategy: data.strategy,
        category: data.category ?? null,
      });
    } catch (e) {
      setMcError(e instanceof Error ? e.message : "Simulation failed");
    }
    setMcLoading(false);
  };

  const fetchCategorySamplePrice = async () => {
    if (!categoryId) return;
    setCategorySampleLoading(true);
    try {
      const res = await fetch(
        `/api/ebay/search?category_id=${encodeURIComponent(categoryId)}`
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Category search failed");
      const items = data.items ?? [];
      if (items.length === 0) {
        setMcError("No listings in this category. Set price manually.");
        setCategorySampleLoading(false);
        return;
      }
      const prices = items.map((i: { price: number }) => i.price).filter((p: number) => p > 0);
      const median = prices.length
        ? [...prices].sort((a, b) => a - b)[Math.floor(prices.length / 2)]!
        : 0;
      if (median > 0) setInitialPrice(String(Math.round(median * 100) / 100));
    } catch (e) {
      setMcError(e instanceof Error ? e.message : "Category search failed");
    }
    setCategorySampleLoading(false);
  };

  const runSimulation = async () => {
    setMcError(null);
    setMcResult(null);
    let price = parseFloat(initialPrice) || 100;

    if (ebayItemId.trim()) {
      setMcLoading(true);
      try {
        const res = await fetch(
          `/api/ebay/product?item_id=${encodeURIComponent(ebayItemId.trim())}`
        );
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "eBay fetch failed");
        price = data.price ?? price;
        setInitialPrice(String(price));
      } catch (e) {
        setMcError(e instanceof Error ? e.message : "Failed to fetch eBay product");
        setMcLoading(false);
        return;
      }
      setMcLoading(false);
    }

    setMcLoading(true);
    try {
      const res = await fetch("/api/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          initialPrice: price,
          drift: drift === "" ? undefined : parseFloat(drift),
          volatility: volatility === "" ? undefined : parseFloat(volatility),
          numPaths: parseInt(numPaths, 10) || 5000,
          horizonDays: parseInt(horizonDays, 10) || 30,
          categoryId: categoryId || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Simulation failed");
      setMcResult({
        percentiles: data.monteCarlo.percentiles,
        mean: data.monteCarlo.mean,
        stdDev: data.monteCarlo.stdDev,
        strategy: data.strategy,
        category: data.category ?? null,
      });
    } catch (e) {
      setMcError(e instanceof Error ? e.message : "Simulation failed");
    }
    setMcLoading(false);
  };

  const runBacktest = async () => {
    if (!mcResult) return;
    setBacktestResult(null);
    setBacktestLoading(true);
    const useHistory = backtestOnHistory && historicalSales.length > 0;
    const body: Record<string, unknown> = {
      bid: mcResult.strategy.bid,
      ask: mcResult.strategy.ask,
      initialCash: parseFloat(initialCash) || 10000,
      maxPosition: 5,
      tradeSize: 1,
      categoryId: categoryId || mcResult.category?.id,
      categoryName: mcResult.category?.name,
    };
    if (useHistory) {
      body.pricePath = historicalSales.map((s, i) => ({ day: i, price: s.price }));
    } else {
      body.initialPrice = parseFloat(initialPrice) || 100;
      body.drift = drift === "" ? 0 : parseFloat(drift);
      body.volatility = volatility === "" ? 0.3 : parseFloat(volatility);
      body.numDays = 90;
    }
    try {
      const res = await fetch("/api/backtest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Backtest failed");
      setBacktestResult({
        totalPnl: data.totalPnl,
        returnPct: data.returnPct,
        numBuys: data.numBuys,
        numSells: data.numSells,
        maxDrawdownPct: data.maxDrawdownPct,
        winRatePct: data.winRatePct,
        finalCash: data.finalCash,
        finalPosition: data.finalPosition,
        finalMtM: data.finalMtM,
        category: data.category ?? null,
      });
    } finally {
      setBacktestLoading(false);
    }
  };

  const runBuyDiscountGrid = async () => {
    setBuyDiscountLoading(true);
    setMcError(null);
    setBuyDiscountResults([]);
    const sellAfterDaysList = sellAfterDaysInput
      .split(/[\s,]+/)
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => !Number.isNaN(n) && n > 0);
    const sellTargetPctList = sellTargetPctInput
      .split(/[\s,]+/)
      .map((s) => parseFloat(s.trim()) / 100)
      .filter((n) => !Number.isNaN(n) && n > 0);
    const buyDiscountPct = Math.min(0.99, Math.max(0.01, parseFloat(buyDiscountPctInput) / 100));

    if (sellAfterDaysList.length === 0 || sellTargetPctList.length === 0) {
      setMcError("Enter at least one hold day (e.g. 7, 14, 30) and one sell target % (e.g. 5, 10, 15).");
      setBuyDiscountLoading(false);
      return;
    }
    try {
      const body: Record<string, unknown> = {
        buyDiscountPct,
        sellAfterDaysList,
        sellTargetPctList,
        initialCash: parseFloat(initialCash) || 10000,
        numDays: 90,
        initialPrice: parseFloat(initialPrice) || 100,
        drift: drift === "" ? 0 : parseFloat(drift),
        volatility: volatility === "" ? 0.3 : parseFloat(volatility),
      };
      if (backtestOnHistory && historicalSales.length > 0) {
        body.pricePath = historicalSales.map((s, i) => ({ day: i, price: s.price }));
      }
      const res = await fetch("/api/backtest-buy-discount", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Backtest failed");
      setBuyDiscountResults(
        data.results.map((r: { sellAfterDays: number; sellTargetPct: number; returnPct: number; totalPnl: number; winRatePct: number; numBuys: number; numSells: number }) => ({
          sellAfterDays: r.sellAfterDays,
          sellTargetPct: r.sellTargetPct,
          returnPct: r.returnPct,
          totalPnl: r.totalPnl,
          winRatePct: r.winRatePct,
          numBuys: r.numBuys,
          numSells: r.numSells,
        }))
      );
    } catch (e) {
      setMcError(e instanceof Error ? e.message : "Backtest failed");
    }
    setBuyDiscountLoading(false);
  };

  return (
    <div className="min-h-screen">
      <header className="border-b border-border bg-panel sticky top-0 z-10 shadow-soft">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <Link href="/" className="text-muted hover:text-stone-900 text-sm mb-2 inline-block">
            ← Dashboard
          </Link>
          <h1 className="text-xl font-semibold text-stone-900">
            Monte Carlo &amp; Backtest
          </h1>
          <p className="text-muted text-sm">
            Derive pricing strategy from simulation, then backtest it.
          </p>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8 space-y-8">
        <section className="bg-panel border border-border rounded-card p-6 shadow-soft">
          <h2 className="text-sm font-medium text-muted uppercase tracking-wider mb-4">
            Item category (eBay)
          </h2>
          <p className="text-muted text-sm mb-3">
            Scope simulation and backtest to Trading Cards, Memorabilia, or another category. Default volatility and drift are set by category.
          </p>
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="w-full max-w-md bg-surface border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/50"
          >
            <option value="">No category</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          {categoryId && (
            <button
              type="button"
              onClick={fetchCategorySamplePrice}
              disabled={categorySampleLoading}
              className="mt-2 px-3 py-1.5 text-sm bg-panel border border-border rounded-lg hover:bg-border/50 disabled:opacity-50"
            >
              {categorySampleLoading ? "Fetching…" : "Use category sample price"}
            </button>
          )}
        </section>

        <section className="bg-panel border border-border rounded-card p-6 shadow-soft">
          <h2 className="text-sm font-medium text-muted uppercase tracking-wider mb-4">
            Historical eBay sales (for market-making strategy)
          </h2>
          <p className="text-muted text-sm mb-3">
            Load sold listings for this category to derive vol/drift and backtest your strategy on real trading card buys/sells.
          </p>
          {categoryId ? (
            <>
              <button
                type="button"
                onClick={fetchHistoricalSales}
                disabled={historicalLoading}
                className="px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent-hover disabled:opacity-50"
              >
                {historicalLoading ? "Loading…" : "Load historical sales"}
              </button>
              {historicalSummary && (
                <div className="mt-4 p-3 bg-surface rounded-lg text-sm space-y-1">
                  <div><strong>{historicalSummary.category.name}</strong>: {historicalSummary.count} sales</div>
                  {historicalSummary.minDate && historicalSummary.maxDate && (
                    <div className="text-muted">
                      {new Date(historicalSummary.minDate).toLocaleDateString()} – {new Date(historicalSummary.maxDate).toLocaleDateString()}
                    </div>
                  )}
                  <div>Median price: {formatPrice(historicalSummary.medianPrice)}</div>
                  <button
                    type="button"
                    onClick={useHistoryForStrategy}
                    disabled={mcLoading || historicalSales.length < 2}
                    className="mt-2 px-3 py-1.5 text-sm bg-green/20 text-green border border-green/40 rounded-lg hover:bg-green/30 disabled:opacity-50"
                  >
                    {mcLoading ? "Running…" : "Use history for strategy (estimate vol/drift & run MC)"}
                  </button>
                </div>
              )}
            </>
          ) : (
            <p className="text-muted text-sm">Select a category above first.</p>
          )}
        </section>

        <section className="bg-panel border border-border rounded-card p-6 shadow-soft">
          <h2 className="text-sm font-medium text-muted uppercase tracking-wider mb-4">
            Data source
          </h2>
          <div className="space-y-3">
            <label className="block text-sm text-muted">
              eBay item ID (optional — fetches live price)
            </label>
            <input
              type="text"
              placeholder="e.g. v1|386936766515|654330421835 or 386936766515"
              value={ebayItemId}
              onChange={(e) => setEbayItemId(e.target.value)}
              className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-accent/50"
            />
            <label className="block text-sm text-muted mt-2">
              Or set initial price manually ($)
            </label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={initialPrice}
              onChange={(e) => setInitialPrice(e.target.value)}
              className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-accent/50"
            />
          </div>
        </section>

        <section className="bg-panel border border-border rounded-card p-6 shadow-soft">
          <h2 className="text-sm font-medium text-muted uppercase tracking-wider mb-4">
            Monte Carlo params
          </h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-muted mb-1">Drift (annual)</label>
              <input
                type="number"
                step="0.01"
                value={drift}
                onChange={(e) => setDrift(e.target.value)}
                className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm font-mono"
              />
            </div>
            <div>
              <label className="block text-sm text-muted mb-1">Volatility (annual)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={volatility}
                onChange={(e) => setVolatility(e.target.value)}
                className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm font-mono"
              />
            </div>
            <div>
              <label className="block text-sm text-muted mb-1">Paths</label>
              <input
                type="number"
                min="100"
                value={numPaths}
                onChange={(e) => setNumPaths(e.target.value)}
                className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm font-mono"
              />
            </div>
            <div>
              <label className="block text-sm text-muted mb-1">Horizon (days)</label>
              <input
                type="number"
                min="1"
                value={horizonDays}
                onChange={(e) => setHorizonDays(e.target.value)}
                className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm font-mono"
              />
            </div>
          </div>
          <button
            onClick={runSimulation}
            disabled={mcLoading}
                className="mt-4 px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent-hover disabled:opacity-50"
          >
            {mcLoading ? "Running…" : "Run simulation"}
          </button>
          {mcError && (
            <p className="mt-2 text-red text-sm">{mcError}</p>
          )}
        </section>

        <section className="bg-panel border border-border rounded-card p-6 shadow-soft">
          <h2 className="text-sm font-medium text-muted uppercase tracking-wider mb-4">
            Strategy: Buy 10% below market (various sell &amp; hold times)
          </h2>
          <p className="text-muted text-sm mb-4">
            Backtest buying at 10% below fair value (SMA of recent prices). Sell when either (a) price reaches your target % above entry, or (b) hold time is reached. Runs a grid of hold days × sell targets.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm text-muted mb-1">Buy discount % (below market)</label>
              <input
                type="number"
                min="1"
                max="50"
                value={buyDiscountPctInput}
                onChange={(e) => setBuyDiscountPctInput(e.target.value)}
                className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm font-mono"
              />
            </div>
            <div>
              <label className="block text-sm text-muted mb-1">Hold days to test (comma-sep, e.g. 7, 14, 30)</label>
              <input
                type="text"
                value={sellAfterDaysInput}
                onChange={(e) => setSellAfterDaysInput(e.target.value)}
                className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm font-mono"
                placeholder="7, 14, 30"
              />
            </div>
            <div>
              <label className="block text-sm text-muted mb-1">Sell target % to test (comma-sep, e.g. 5, 10, 15)</label>
              <input
                type="text"
                value={sellTargetPctInput}
                onChange={(e) => setSellTargetPctInput(e.target.value)}
                className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm font-mono"
                placeholder="5, 10, 15"
              />
            </div>
          </div>
          {historicalSales.length > 0 && (
            <label className="flex items-center gap-2 mb-4 cursor-pointer">
              <input
                type="checkbox"
                checked={backtestOnHistory}
                onChange={(e) => setBacktestOnHistory(e.target.checked)}
                className="rounded border-border"
              />
              <span className="text-sm text-muted">Use historical eBay sales path ({historicalSales.length} events)</span>
            </label>
          )}
          <button
            onClick={runBuyDiscountGrid}
            disabled={buyDiscountLoading}
            className="px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent-hover disabled:opacity-50"
          >
            {buyDiscountLoading ? "Running…" : "Backtest grid (sell & hold times)"}
          </button>

          {buyDiscountResults.length > 0 && (
            <div className="mt-6 overflow-x-auto">
              <p className="text-muted text-sm mb-2">Return % by hold days (rows) × sell target % (cols)</p>
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-2 pr-4 text-muted">Hold days \ Sell target %</th>
                    {[...new Set(buyDiscountResults.map((r) => r.sellTargetPct))].sort((a, b) => a - b).map((pct) => (
                      <th key={pct} className="text-right py-2 px-2 text-muted">{((pct as number) * 100).toFixed(0)}%</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[...new Set(buyDiscountResults.map((r) => r.sellAfterDays))].sort((a, b) => a - b).map((days) => (
                    <tr key={days} className="border-b border-border/50">
                      <td className="py-2 pr-4 font-mono">{days}d</td>
                      {[...new Set(buyDiscountResults.map((r) => r.sellTargetPct))].sort((a, b) => a - b).map((pct) => {
                        const r = buyDiscountResults.find((x) => x.sellAfterDays === days && x.sellTargetPct === pct);
                        if (!r) return <td key={pct} className="py-2 px-2 text-right">—</td>;
                        return (
                          <td key={pct} className="py-2 px-2 text-right">
                            <span className={r.returnPct >= 0 ? "text-green" : "text-red"}>
                              {(r.returnPct * 100).toFixed(1)}%
                            </span>
                            <span className="block text-xs text-muted">WR {r.winRatePct.toFixed(0)}%</span>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-muted text-xs mt-2">WR = win rate (profitable sells / total sells)</p>
            </div>
          )}
        </section>

        {mcResult && (
          <>
            <section className="bg-panel border border-border rounded-card p-6 shadow-soft">
              <div className="flex items-center justify-between gap-2 mb-4">
                <h2 className="text-sm font-medium text-muted uppercase tracking-wider">
                  Distribution &amp; strategy
                </h2>
                {mcResult.category && (
                  <span className="text-xs px-2 py-1 rounded bg-stone-100 text-muted">
                    {mcResult.category.name}
                  </span>
                )}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-4">
                <div className="bg-surface rounded-lg p-3">
                  <div className="text-muted text-xs">P5</div>
                  <div className="font-mono text-stone-900">{formatPrice(mcResult.percentiles.p5)}</div>
                </div>
                <div className="bg-surface rounded-lg p-3">
                  <div className="text-muted text-xs">P25</div>
                  <div className="font-mono text-stone-900">{formatPrice(mcResult.percentiles.p25)}</div>
                </div>
                <div className="bg-surface rounded-lg p-3">
                  <div className="text-muted text-xs">P50</div>
                  <div className="font-mono text-stone-900">{formatPrice(mcResult.percentiles.p50)}</div>
                </div>
                <div className="bg-surface rounded-lg p-3">
                  <div className="text-muted text-xs">P75</div>
                  <div className="font-mono text-stone-900">{formatPrice(mcResult.percentiles.p75)}</div>
                </div>
                <div className="bg-surface rounded-lg p-3">
                  <div className="text-muted text-xs">P95</div>
                  <div className="font-mono text-stone-900">{formatPrice(mcResult.percentiles.p95)}</div>
                </div>
              </div>
              <div className="flex flex-wrap gap-4 items-baseline">
                <div>
                  <span className="text-muted text-sm">Fair value </span>
                  <span className="font-mono text-lg text-stone-900">{formatPrice(mcResult.strategy.fairValue)}</span>
                </div>
                <div>
                  <span className="text-muted text-sm">Bid </span>
                  <span className="font-mono text-green">{formatPrice(mcResult.strategy.bid)}</span>
                </div>
                <div>
                  <span className="text-muted text-sm">Ask </span>
                  <span className="font-mono text-red">{formatPrice(mcResult.strategy.ask)}</span>
                </div>
                <div className="text-muted text-sm">
                  Spread {mcResult.strategy.spreadPct}% ({mcResult.strategy.method})
                </div>
              </div>
              <p className="text-muted text-xs mt-2">
                Mean {formatPrice(mcResult.mean)} · σ {formatPrice(mcResult.stdDev)}
              </p>
            </section>

            <section className="bg-panel border border-border rounded-card p-6 shadow-soft">
              <div className="flex items-center justify-between gap-2 mb-4">
                <h2 className="text-sm font-medium text-muted uppercase tracking-wider">
                  Backtest (90-day path, strategy bid/ask)
                </h2>
                {backtestResult?.category && (
                  <span className="text-xs px-2 py-1 rounded bg-stone-100 text-muted">
                    {backtestResult.category.name}
                  </span>
                )}
              </div>
              <div className="flex flex-wrap gap-4 mb-4 items-end">
                <div>
                  <label className="block text-sm text-muted mb-1">Initial cash ($)</label>
                  <input
                    type="number"
                    min="0"
                    value={initialCash}
                    onChange={(e) => setInitialCash(e.target.value)}
                    className="w-32 bg-surface border border-border rounded-lg px-3 py-2 text-sm font-mono"
                  />
                </div>
                {historicalSales.length > 0 && (
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={backtestOnHistory}
                      onChange={(e) => setBacktestOnHistory(e.target.checked)}
                      className="rounded border-border"
                    />
                    <span className="text-sm text-muted">Backtest on historical eBay sales ({historicalSales.length} events)</span>
                  </label>
                )}
              </div>
              <button
                onClick={runBacktest}
                disabled={backtestLoading}
                className="px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent-hover disabled:opacity-50"
              >
                {backtestLoading ? "Running…" : backtestOnHistory && historicalSales.length > 0 ? "Run backtest on history" : "Run backtest (simulated path)"}
              </button>

              {backtestResult && (
                <div className="mt-6 grid grid-cols-2 sm:grid-cols-3 gap-4">
                  <div className="bg-surface rounded-lg p-3">
                    <div className="text-muted text-xs">Total P&L</div>
                    <div className={`font-mono ${backtestResult.totalPnl >= 0 ? "text-green" : "text-red"}`}>
                      {formatPrice(backtestResult.totalPnl)}
                    </div>
                  </div>
                  <div className="bg-surface rounded-lg p-3">
                    <div className="text-muted text-xs">Return</div>
                    <div className={`font-mono ${backtestResult.returnPct >= 0 ? "text-green" : "text-red"}`}>
                      {(backtestResult.returnPct * 100).toFixed(2)}%
                    </div>
                  </div>
                  <div className="bg-surface rounded-lg p-3">
                    <div className="text-muted text-xs">Max drawdown</div>
                    <div className="font-mono text-red">{backtestResult.maxDrawdownPct.toFixed(1)}%</div>
                  </div>
                  <div className="bg-surface rounded-lg p-3">
                    <div className="text-muted text-xs">Trades (B/S)</div>
                    <div className="font-mono text-stone-900">{backtestResult.numBuys} / {backtestResult.numSells}</div>
                  </div>
                  <div className="bg-surface rounded-lg p-3">
                    <div className="text-muted text-xs">Win rate</div>
                    <div className="font-mono text-stone-900">{backtestResult.winRatePct.toFixed(0)}%</div>
                  </div>
                  <div className="bg-surface rounded-lg p-3">
                    <div className="text-muted text-xs">Final (cash + MtM)</div>
                    <div className="font-mono text-stone-900">
                      {formatPrice(backtestResult.finalCash + backtestResult.finalMtM)}
                    </div>
                  </div>
                </div>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}
