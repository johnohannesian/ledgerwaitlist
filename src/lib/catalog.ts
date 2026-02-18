import type { PSACard } from "@/types/card";

/** Card key for lookups (player-set-year-grade). Used as canonical SKU. */
export function cardKey(card: PSACard): string {
  const v = card.variant ?? "base";
  return `${card.year}-${card.set}-${card.player.toLowerCase().replace(/\s+/g, "-")}-${card.cardNumber}-${v}-${card.grade}`.replace(/\s/g, "-");
}

/** Default eBay category for sold search (Sports Trading Cards). */
export const EBAY_SOLD_CATEGORY_ID = "261328";

/** Build eBay search keywords for this card (sold listings). */
export function ebaySearchKeywords(card: PSACard): string {
  return `${card.player} ${card.year} ${card.set} PSA ${card.grade}`.trim();
}

export const seedCards: PSACard[] = [
  { id: "card-1", player: "Shohei Ohtani", year: 2023, set: "Topps Chrome", cardNumber: "1", grade: 10 },
  { id: "card-2", player: "Shohei Ohtani", year: 2023, set: "Topps Chrome", cardNumber: "1", grade: 9 },
  { id: "card-3", player: "Julio Rodriguez", year: 2022, set: "Bowman Chrome", cardNumber: "1", grade: 10 },
  { id: "card-4", player: "Julio Rodriguez", year: 2022, set: "Bowman Chrome", cardNumber: "1", grade: 9 },
  { id: "card-5", player: "Juan Soto", year: 2024, set: "Topps Series 1", cardNumber: "100", grade: 10 },
  { id: "card-6", player: "Juan Soto", year: 2024, set: "Topps Series 1", cardNumber: "100", grade: 9 },
  { id: "card-7", player: "Gunnar Henderson", year: 2023, set: "Topps Chrome", cardNumber: "50", grade: 10 },
  { id: "card-8", player: "Elly De La Cruz", year: 2023, set: "Bowman Chrome", cardNumber: "1", grade: 10 },
  { id: "card-9", player: "Mike Trout", year: 2011, set: "Topps Update", cardNumber: "175", grade: 10 },
  { id: "card-10", player: "Ronald Acuña Jr", year: 2018, set: "Topps Chrome", cardNumber: "1", grade: 10 },
];
