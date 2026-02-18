/**
 * Core types for PSA-graded cards and market data.
 */

export interface PSACard {
  id: string;
  player: string;
  year: number;
  set: string;
  cardNumber: string;
  variant?: string; // e.g. "Base", "Silver", "/99"
  grade: number; // PSA 1-10
  population?: number; // PSA pop report count
}

export interface Comp {
  id: string;
  cardId: string;
  price: number;
  soldAt: string; // ISO date
  source: string; // e.g. "eBay", "PWCC", "marketplace"
  listingType?: "auction" | "bin";
  /** Link to listing (e.g. eBay item or sold-search) for traceability. */
  url?: string;
}

export interface Listing {
  id: string;
  cardId: string;
  askPrice: number;
  listedAt: string;
  source: string;
}

export interface DeterminedValue {
  cardId: string;
  value: number;
  confidence: "high" | "medium" | "low"; // based on comp count, recency
  compCount: number;
  lastCompsAt?: string;
  method: "comps_median" | "comps_weighted" | "comps_pop_adjusted";
}

export interface CardWithValue extends PSACard {
  comps: Comp[];
  determinedValue: DeterminedValue | null;
  lowestAsk?: number;
  /** Canonical SKU (year-set-player-number-grade) for sorting and display. */
  sku?: string;
}
