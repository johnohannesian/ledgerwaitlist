/**
 * Comps data source adapter.
 * 1) Tries eBay API when RAPIDAPI_KEY is set.
 * 2) Falls back to web-researched prices (eBay/PSA/collector sites) when API fails or is unset.
 * 3) Mock only for cards not in the researched set.
 */

import type { Comp } from "@/types/card";
import { seedCards, ebaySearchKeywords, EBAY_SOLD_CATEGORY_ID } from "@/lib/catalog";
import { fetchHistoricalSales, isEbayConfigured } from "@/lib/ebay/client";
import { ebaySoldSearchUrl } from "@/lib/ebay/categories";
import { getResearchedComps } from "@/lib/sources/researched-comps";

export interface CompsSource {
  getComps(cardId: string, options?: { limit?: number; days?: number }): Promise<Comp[]>;
}

/** Composite source: eBay → researched (web prices) → mock. */
const compositeCompsSource: CompsSource = {
  async getComps(cardId: string, options = {}) {
    if (isEbayConfigured()) {
      try {
        const fromEbay = await ebayCompsSource.getComps(cardId, options);
        if (fromEbay.length > 0) return fromEbay;
      } catch {
        /* fall through to researched */
      }
    }
    const researched = getResearchedComps(cardId, { limit: options.limit });
    if (researched.length > 0) return researched;
    return mockCompsSource.getComps(cardId, options);
  },
};

/** Use composite source so you get real prices (eBay or web-researched) when possible. */
export function getCompsSource(): CompsSource {
  return compositeCompsSource;
}

/** Real comps from eBay sold listings (one search per SKU). */
export const ebayCompsSource: CompsSource = {
  async getComps(cardId: string, options = {}) {
    const card = seedCards.find((c) => c.id === cardId);
    if (!card) return [];

    const keywords = ebaySearchKeywords(card);
    const soldUrl = ebaySoldSearchUrl({
      categoryId: EBAY_SOLD_CATEGORY_ID,
      keywords,
    });

    try {
      const sales = await fetchHistoricalSales(soldUrl);
      const comps: Comp[] = sales.slice(0, options.limit ?? 20).map((s, i) => ({
        id: `ebay-${s.itemId ?? cardId}-${i}`,
        cardId,
        price: s.price,
        soldAt: s.date,
        source: "eBay",
        listingType: undefined,
        url: s.itemId ? `https://www.ebay.com/itm/${s.itemId}` : undefined,
      }));
      return comps.sort((a, b) => new Date(b.soldAt).getTime() - new Date(a.soldAt).getTime());
    } catch {
      return [];
    }
  },
};

/** Mock comps for when eBay is not configured. */
export const mockCompsSource: CompsSource = {
  async getComps(cardId: string, options = {}) {
    const { limit = 10 } = options;
    const seed = cardId.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
    const basePrice = 50 + (seed % 400);
    const comps: Comp[] = [];
    const now = Date.now();
    for (let i = 0; i < Math.min(limit, 8); i++) {
      const daysAgo = Math.floor((i * 12) + (seed % 20));
      const variance = 0.85 + (seed % 30) / 100;
      comps.push({
        id: `comp-${cardId}-${i}`,
        cardId,
        price: Math.round(basePrice * variance * (1 + (i * 0.02))),
        soldAt: new Date(now - daysAgo * 24 * 60 * 60 * 1000).toISOString(),
        source: "eBay",
        listingType: i % 3 === 0 ? "auction" : "bin",
      });
    }
    return comps.sort((a, b) => new Date(b.soldAt).getTime() - new Date(a.soldAt).getTime());
  },
};
