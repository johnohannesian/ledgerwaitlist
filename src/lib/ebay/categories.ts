/**
 * eBay category definitions (US marketplace).
 * Used to scope simulation and backtest to Trading Cards vs Memorabilia, etc.
 * Category IDs from eBay's category tree (Collectibles & Art > Trading Cards, Sports Mem, etc.).
 */

export interface EbayCategory {
  id: string;
  name: string;
  /** Optional: default annual volatility for this category (used when no comps). */
  defaultVolatility?: number;
  /** Optional: default drift for this category. */
  defaultDrift?: number;
}

/**
 * Curated eBay US categories for trading cards and memorabilia.
 * Subcategories can be added; IDs from eBay GetCategories / Taxonomy.
 */
export const EBAY_CATEGORIES: EbayCategory[] = [
  // Trading Cards (parent and common subcategories)
  { id: "183454", name: "Trading Cards", defaultVolatility: 0.35, defaultDrift: 0 },
  { id: "261328", name: "Sports Trading Cards", defaultVolatility: 0.38, defaultDrift: 0 },
  { id: "183050", name: "Sports Trading Card Singles", defaultVolatility: 0.4, defaultDrift: 0 },
  { id: "64482", name: "Non-Sport Trading Cards", defaultVolatility: 0.32, defaultDrift: 0 },
  // Memorabilia
  { id: "44839", name: "Sports Mem, Cards & Fan Shop", defaultVolatility: 0.3, defaultDrift: 0 },
  { id: "213", name: "Sports Memorabilia", defaultVolatility: 0.28, defaultDrift: 0 },
  { id: "43304", name: "Sports Trading Cards & Accessories", defaultVolatility: 0.36, defaultDrift: 0 },
  // Broader collectibles (for comparison)
  { id: "1", name: "Collectibles", defaultVolatility: 0.33, defaultDrift: 0 },
];

const byId = new Map(EBAY_CATEGORIES.map((c) => [c.id, c]));

export function getEbayCategoryById(id: string): EbayCategory | undefined {
  return byId.get(id);
}

export function getEbayCategories(): EbayCategory[] {
  return [...EBAY_CATEGORIES];
}

/**
 * Build eBay US search URL for a category (optional keywords).
 */
export function ebaySearchUrl(options: { categoryId: string; keywords?: string }): string {
  const { categoryId, keywords } = options;
  const base = "https://www.ebay.com/sch/i.html";
  const params = new URLSearchParams();
  if (keywords?.trim()) params.set("_nkw", keywords.trim());
  params.set("_sacat", categoryId);
  return `${base}?${params.toString()}`;
}

/**
 * Build eBay US search URL for sold/completed listings (historical sales).
 * LH_Sold=1 shows sold items so we can backtest on real trading card sales.
 */
export function ebaySoldSearchUrl(options: { categoryId: string; keywords?: string }): string {
  const url = ebaySearchUrl(options);
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}LH_Sold=1`;
}
