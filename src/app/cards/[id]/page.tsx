"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import type { CardWithValue } from "@/types/card";
import Link from "next/link";

function formatPrice(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function CardDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const [card, setCard] = useState<CardWithValue | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    fetch(`/api/cards/${id}`)
      .then((res) => {
        if (!res.ok) throw new Error("Not found");
        return res.json();
      })
      .then(setCard)
      .catch(() => setCard(null))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse text-muted">Loading...</div>
      </div>
    );
  }

  if (!card) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <p className="text-muted">Card not found.</p>
        <Link href="/" className="text-accent hover:underline">Back to dashboard</Link>
      </div>
    );
  }

  const dv = card.determinedValue;

  return (
    <div className="min-h-screen">
      <header className="border-b border-border bg-panel sticky top-0 z-10 shadow-soft">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <Link href="/" className="text-muted hover:text-stone-900 text-sm mb-2 inline-block">
            ← Dashboard
          </Link>
          <h1 className="text-xl font-semibold text-stone-900">{card.player}</h1>
          <p className="text-muted text-sm">
            {card.year} {card.set} #{card.cardNumber} · PSA {card.grade}
          </p>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        <section className="bg-panel border border-border rounded-card p-6 shadow-soft">
          <h2 className="text-sm font-medium text-muted uppercase tracking-wider mb-4">Our determined value</h2>
          {dv ? (
            <div className="flex flex-wrap items-baseline gap-4">
              <span className="text-3xl font-semibold text-stone-900 font-mono">{formatPrice(dv.value)}</span>
              <span className={`text-sm px-2 py-1 rounded ${
                dv.confidence === "high" ? "bg-green-soft text-green" :
                dv.confidence === "medium" ? "bg-amber-100 text-amber-800" :
                "bg-red-soft text-red"
              }`}>
                {dv.confidence} confidence
              </span>
              <span className="text-muted text-sm">from {dv.compCount} comps · {dv.method.replace(/_/g, " ")}</span>
            </div>
          ) : (
            <p className="text-muted">No comps — value TBD</p>
          )}
          {card.population != null && (
            <p className="text-muted text-sm mt-2">PSA population: {card.population.toLocaleString()}</p>
          )}
        </section>

        {card.lowestAsk != null && (
          <section className="bg-panel border border-border rounded-card p-6 shadow-soft">
            <h2 className="text-sm font-medium text-muted uppercase tracking-wider mb-2">Low ask (market)</h2>
            <p className="text-xl font-mono text-stone-800">{formatPrice(card.lowestAsk)}</p>
          </section>
        )}

        <section className="bg-panel border border-border rounded-card p-6 shadow-soft">
          <h2 className="text-sm font-medium text-muted uppercase tracking-wider mb-4">Recent comps</h2>
          <p className="text-muted text-xs mb-3">Click a comp to open the eBay listing or sold search in a new tab.</p>
          {card.comps.length === 0 ? (
            <p className="text-muted">No comps yet.</p>
          ) : (
            <ul className="space-y-2">
              {card.comps.map((c) => (
                <li key={c.id} className="flex justify-between items-center py-2 border-b border-border last:border-0">
                  {c.url ? (
                    <a
                      href={c.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex justify-between items-center w-full group hover:bg-stone-50 rounded px-2 -mx-2 py-1 -my-1 transition-colors"
                    >
                      <span className="font-mono text-stone-800 group-hover:text-accent">{formatPrice(c.price)}</span>
                      <span className="text-muted text-sm">{formatDate(c.soldAt)} · {c.source} ↗</span>
                    </a>
                  ) : (
                    <>
                      <span className="text-stone-800 font-mono">{formatPrice(c.price)}</span>
                      <span className="text-muted text-sm">{formatDate(c.soldAt)} · {c.source}</span>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
