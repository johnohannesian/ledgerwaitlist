import { NextResponse } from "next/server";
import { seedCards, cardKey } from "@/lib/catalog";
import { getCompsSource } from "@/lib/sources/comps";
import { mockPopulationSource } from "@/lib/sources/population";
import { computeDeterminedValue } from "@/lib/valuation";
import type { CardWithValue } from "@/types/card";

export async function GET() {
  const compsSource = getCompsSource();
  const cards: CardWithValue[] = [];

  for (const card of seedCards) {
    try {
      const comps = await compsSource.getComps(card.id, { limit: 20, days: 90 });
      const key = cardKey(card);
      const population = await mockPopulationSource.getPopulation(key);
      const determinedValue = computeDeterminedValue(card.id, comps, population, "comps_weighted");

      cards.push({
        ...card,
        sku: key,
        population: population ?? undefined,
        comps,
        determinedValue,
        lowestAsk: determinedValue ? Math.round(determinedValue.value * (1.05 + Math.random() * 0.1)) : undefined,
      });
    } catch {
      cards.push({
        ...card,
        sku: cardKey(card),
        comps: [],
        determinedValue: null,
      });
    }
  }

  cards.sort((a, b) => cardKey(a).localeCompare(cardKey(b)));

  return NextResponse.json({ cards });
}
