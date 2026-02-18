"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { CardWithValue } from "@/types/card";

const formatPrice = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);

type Category = "all" | "sports" | "tcg";

export default function MarketPage() {
  const [cards, setCards] = useState<CardWithValue[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<Category>("all");

  useEffect(() => {
    fetch("/api/cards")
      .then((res) => res.json())
      .then((data) => {
        setCards(data.cards ?? []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const filtered = cards.filter((c) => {
    const matchSearch =
      !search ||
      c.player.toLowerCase().includes(search.toLowerCase()) ||
      c.set.toLowerCase().includes(search.toLowerCase());
    const matchCategory =
      category === "all" ||
      (category === "sports" && !["Pokemon", "Magic"].some((t) => c.set?.includes(t))) ||
      (category === "tcg" && ["Pokemon", "Magic"].some((t) => c.set?.includes(t)));
    return matchSearch && matchCategory;
  });

  // Derive bid from our value (e.g. 2% below mid); ask = lowestAsk or value + spread
  const rows = filtered.map((card) => {
    const mid = card.determinedValue?.value ?? 0;
    const ask = card.lowestAsk ?? mid * 1.05;
    const bid = mid * 0.98;
    const spread = ask - bid;
    const spreadPct = mid > 0 ? (spread / mid) * 100 : 0;
    const lastSale = card.comps?.[0]?.price;
    return {
      ...card,
      bid,
      ask,
      spread,
      spreadPct,
      lastSale,
    };
  });

  return (
    <div className="min-h-screen">
      {/* Hero — CollectPure-style: clean, spacious */}
      <section className="border-b border-border bg-panel">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
          <h1 className="text-3xl sm:text-4xl font-bold text-stone-900 tracking-tight">
            The exchange for sports & trading cards
          </h1>
          <p className="mt-3 text-muted text-lg max-w-xl">
            Real-time bids and asks. Transparent pricing. Built for card traders.
          </p>
        </div>
      </section>

      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Categories + Search */}
        <div className="flex flex-col sm:flex-row gap-4 sm:items-center sm:justify-between mb-6">
          <div className="flex rounded-lg bg-stone-100 border border-border p-1">
            {(["all", "sports", "tcg"] as const).map((cat) => (
              <button
                key={cat}
                onClick={() => setCategory(cat)}
                className={`px-4 py-2 rounded-md text-sm font-medium capitalize transition-colors ${
                  category === cat ? "bg-panel text-stone-900 shadow-soft" : "text-muted hover:text-stone-700"
                }`}
              >
                {cat === "all" ? "All" : cat === "sports" ? "Sports" : "TCG"}
              </button>
            ))}
          </div>
          <div className="relative">
            <input
              type="search"
              placeholder="Search player or set..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full sm:w-72 bg-panel border border-border rounded-lg pl-10 pr-4 py-2.5 text-sm text-stone-900 placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent/40"
            />
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
        </div>

        {/* Order-book style table */}
        <div className="rounded-card border border-border bg-panel overflow-hidden shadow-soft">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-stone-50/80">
                  <th className="text-left py-3.5 px-4 font-semibold text-muted uppercase tracking-wider">Card</th>
                  <th className="text-right py-3.5 px-4 font-semibold text-muted uppercase tracking-wider">Best bid</th>
                  <th className="text-right py-3.5 px-4 font-semibold text-muted uppercase tracking-wider">Best ask</th>
                  <th className="text-right py-3.5 px-4 font-semibold text-muted uppercase tracking-wider">Last</th>
                  <th className="text-right py-3.5 px-4 font-semibold text-muted uppercase tracking-wider">Spread</th>
                  <th className="text-right py-3.5 px-4 font-semibold text-muted uppercase tracking-wider w-24">Action</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i} className="border-b border-border/50">
                      <td colSpan={6} className="py-4 px-4">
                        <div className="h-5 bg-stone-200 rounded w-3/4 animate-pulse" />
                      </td>
                    </tr>
                  ))
                ) : (
                  rows.map((row) => (
                    <tr
                      key={row.id}
                      className="border-b border-border/50 hover:bg-stone-50/60 transition-colors"
                    >
                      <td className="py-3.5 px-4">
                        <Link href={`/cards/${row.id}`} className="block group">
                          <span className="font-medium text-stone-900 group-hover:text-accent">
                            {row.player}
                          </span>
                          <span className="text-muted text-xs block mt-0.5">
                            {row.year} {row.set} #{row.cardNumber} · PSA {row.grade}
                          </span>
                        </Link>
                      </td>
                      <td className="text-right py-3.5 px-4 font-mono text-green font-medium">
                        {formatPrice(row.bid)}
                      </td>
                      <td className="text-right py-3.5 px-4 font-mono text-red font-medium">
                        {formatPrice(row.ask)}
                      </td>
                      <td className="text-right py-3.5 px-4 font-mono text-stone-700">
                        {row.lastSale != null ? formatPrice(row.lastSale) : "—"}
                      </td>
                      <td className="text-right py-3.5 px-4 font-mono text-muted">
                        {row.spreadPct.toFixed(1)}%
                      </td>
                      <td className="text-right py-3.5 px-4">
                        <Link
                          href={`/cards/${row.id}`}
                          className="inline-block px-3 py-1.5 rounded-lg bg-amber-100 text-accent text-xs font-medium hover:bg-amber-200"
                        >
                          Trade
                        </Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {!loading && rows.length === 0 && (
            <div className="py-16 text-center text-muted">
              No listings match. Try a different search or category.
            </div>
          )}
        </div>

        <p className="mt-4 text-muted text-xs">
          Bids and asks are indicative. Accept a bid for instant liquidity or list at your ask. All prices USD.
        </p>
      </div>
    </div>
  );
}
