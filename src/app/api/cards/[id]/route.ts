import { NextResponse } from "next/server";
import { seedCards, cardKey } from "@/lib/catalog";
import { getCompsSource } from "@/lib/sources/comps";
import { mockPopulationSource } from "@/lib/sources/population";
import { computeDeterminedValue } from "@/lib/valuation";
import type { CardWithValue } from "@/types/card";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const card = seedCards.find((c) => c.id === id);
  if (!card) return NextResponse.json({ error: "Card not found" }, { status: 404 });

  const compsSource = getCompsSource();
  const comps = await compsSource.getComps(card.id, { limit: 20, days: 90 });
  const key = cardKey(card);
  const population = await mockPopulationSource.getPopulation(key);
  const determinedValue = computeDeterminedValue(card.id, comps, population, "comps_weighted");

  const result: CardWithValue = {
    ...card,
    sku: key,
    population: population ?? undefined,
    comps,
    determinedValue,
    lowestAsk: determinedValue ? Math.round(determinedValue.value * (1.05 + Math.random() * 0.1)) : undefined,
  };

  return NextResponse.json(result);
}
