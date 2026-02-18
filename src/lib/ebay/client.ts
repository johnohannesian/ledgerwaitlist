/**
 * eBay API client (RapidAPI ebay32).
 * Uses RAPIDAPI_KEY env var — never commit the key.
 */

const HOST = "ebay32.p.rapidapi.com";

export interface EbayProductResponse {
  data?: {
    item_id?: string;
    itemId?: string;
    title?: string;
    price?: number | string | { value?: string; currency?: string };
    current_price?: number | string;
    item_web_url?: string;
    url?: string;
    condition?: string;
    image?: { image_url?: string } | string;
    item_creation_date?: string;
    item_end_date?: string;
    end_time?: string;
    [key: string]: unknown;
  };
  message?: string;
}

export interface EbayProduct {
  itemId: string;
  title: string;
  price: number;
  currency: string;
  url?: string;
  condition?: string;
  imageUrl?: string;
  createdAt?: string;
  endedAt?: string;
}

function getApiKey(): string {
  const key = process.env.RAPIDAPI_KEY;
  if (!key) {
    throw new Error("RAPIDAPI_KEY is not set. Add it to .env.local for eBay API calls.");
  }
  return key;
}

function parsePrice(value: unknown): number {
  if (typeof value === "number" && !Number.isNaN(value)) return value;
  if (typeof value === "string") {
    const n = parseFloat(value.replace(/[^0-9.-]/g, ""));
    return Number.isNaN(n) ? 0 : n;
  }
  return 0;
}

/**
 * Extract numeric item ID for APIs that expect digits only (e.g. 195499451557).
 */
function normalizeItemId(itemId: string): string {
  const trimmed = itemId.trim();
  const numeric = trimmed.replace(/\D/g, "");
  return numeric || trimmed;
}

/**
 * Fetch a single eBay product by item_id.
 * Uses ebay32: GET /product/{id}?country=germany&country_code=de
 * Override with EBAY_COUNTRY and EBAY_COUNTRY_CODE env vars if needed (e.g. country=us&country_code=us).
 */
export async function fetchEbayProduct(itemId: string): Promise<EbayProduct | null> {
  const key = getApiKey();
  const id = normalizeItemId(itemId);
  const country = process.env.EBAY_COUNTRY ?? "germany";
  const countryCode = process.env.EBAY_COUNTRY_CODE ?? "de";
  const url = `https://${HOST}/product/${id}?country=${encodeURIComponent(country)}&country_code=${encodeURIComponent(countryCode)}`;

  const res = await fetch(url, {
    method: "GET",
    headers: {
      "x-rapidapi-host": HOST,
      "x-rapidapi-key": key,
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`eBay API error ${res.status}: ${text}`);
  }

  const json = (await res.json()) as EbayProductResponse;
  const d = json?.data ?? json;
  if (!d || typeof d !== "object") return null;

  const price =
    d.current_price != null
      ? parsePrice(d.current_price)
      : d.price != null
        ? typeof d.price === "object" && d.price && "value" in d.price
          ? parsePrice((d.price as { value?: unknown }).value)
          : parsePrice(d.price)
        : 0;
  const imageVal = d.image;
  const imageUrl =
    typeof imageVal === "string"
      ? imageVal
      : typeof imageVal === "object" && imageVal?.image_url
        ? String(imageVal.image_url)
        : undefined;
  return {
    itemId: String(d.item_id ?? d.itemId ?? id),
    title: String(d.title ?? ""),
    price,
    currency: "USD",
    url: d.item_web_url ?? d.url,
    condition: d.condition as string | undefined,
    imageUrl,
    createdAt: d.item_creation_date,
    endedAt: d.item_end_date ?? d.end_time,
  };
}

/**
 * Search eBay by URL (e.g. category or keyword search).
 * Uses the API's search endpoint with url= encoded eBay search URL.
 */
export interface EbaySearchItem {
  itemId: string;
  title: string;
  price: number;
  url?: string;
}

/** A single historical sale (sold listing) for backtesting. */
export interface HistoricalSale {
  date: string; // ISO
  price: number;
  title?: string;
  itemId?: string;
}

export interface EbaySearchResponse {
  data?: {
    item?: unknown[];
    items?: unknown[];
    search_results?: unknown[];
    [key: string]: unknown;
  };
  message?: string;
}

function parseSearchItem(raw: unknown): EbaySearchItem | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const itemId = o.item_id ?? o.itemId ?? o.id;
  const title = o.title ?? "";
  const price = o.price != null
    ? parsePrice(typeof o.price === "object" && o.price && "value" in o.price
        ? (o.price as { value?: unknown }).value
        : o.price)
    : 0;
  if (!itemId) return null;
  return {
    itemId: String(itemId),
    title: String(title),
    price,
    url: typeof o.item_web_url === "string" ? o.item_web_url : undefined,
  };
}

function parseSoldDate(raw: unknown): string | null {
  if (raw == null) return null;
  if (typeof raw === "string") {
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  return null;
}

function parseHistoricalSale(raw: unknown, fallbackIndex: number): HistoricalSale | null {
  const item = parseSearchItem(raw);
  const o = raw as Record<string, unknown>;
  const price = item?.price ?? parsePrice(o.sold_price ?? o.current_price ?? o.final_price);
  if (!price || price <= 0) return null;
  const date =
    parseSoldDate(o.end_time ?? o.item_end_date ?? o.sold_at ?? o.end_date ?? o.ended_at)
    ?? new Date(Date.now() - fallbackIndex * 24 * 60 * 60 * 1000).toISOString();
  return {
    date,
    price,
    title: item?.title,
    itemId: item?.itemId,
  };
}

/**
 * Search eBay by full search URL (e.g. from ebaySearchUrl in categories).
 * Returns a list of items with itemId, title, price for use in category-level pricing.
 * If the API returns 404, try /search_product instead of /search (host-dependent).
 */
export async function searchEbayByUrl(ebaySearchUrl: string): Promise<EbaySearchItem[]> {
  const key = getApiKey();
  const encoded = encodeURIComponent(ebaySearchUrl);
  const url = `https://${HOST}/search?url=${encoded}`;

  const res = await fetch(url, {
    method: "GET",
    headers: {
      "x-rapidapi-host": HOST,
      "x-rapidapi-key": key,
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`eBay search error ${res.status}: ${text}`);
  }

  const json = (await res.json()) as EbaySearchResponse;
  const data = json?.data;
  const rawList =
    Array.isArray(data?.item)
      ? data.item
      : Array.isArray(data?.items)
        ? data.items
        : Array.isArray(data?.search_results)
          ? data.search_results
          : [];
  const items: EbaySearchItem[] = [];
  for (const raw of rawList) {
    const item = parseSearchItem(raw);
    if (item && item.price > 0) items.push(item);
  }
  return items;
}

/**
 * Fetch historical sold listings (trading card buys/sells) for backtesting.
 * Uses eBay sold-search URL; parses sale date from end_time/item_end_date/sold_at when present.
 */
export async function fetchHistoricalSales(ebaySoldSearchUrl: string): Promise<HistoricalSale[]> {
  const key = getApiKey();
  const encoded = encodeURIComponent(ebaySoldSearchUrl);
  const url = `https://${HOST}/search?url=${encoded}`;
  const res = await fetch(url, {
    method: "GET",
    headers: { "x-rapidapi-host": HOST, "x-rapidapi-key": key },
  });
  if (!res.ok) throw new Error(`eBay search error ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as EbaySearchResponse;
  const list =
    Array.isArray(json?.data?.item)
      ? json.data.item
      : Array.isArray(json?.data?.items)
        ? json.data.items
        : Array.isArray(json?.data?.search_results)
          ? json.data.search_results
          : [];
  const sales: HistoricalSale[] = [];
  list.forEach((raw: unknown, i: number) => {
    const s = parseHistoricalSale(raw, i);
    if (s) sales.push(s);
  });
  if (sales.length > 0) sales.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  return sales;
}

/** Check if the eBay client is configured (RAPIDAPI_KEY present). */
export function isEbayConfigured(): boolean {
  return Boolean(process.env.RAPIDAPI_KEY);
}
