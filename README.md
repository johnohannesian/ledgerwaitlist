# Ledger

**The world's first zero-fee trading card exchange**

A waitlist landing page with animated sales visualization (dollar amounts and stock emojis).

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Deploy to Vercel

1. **Connect GitHub repository:**
   - Go to [vercel.com](https://vercel.com) and sign in
   - Click "Add New Project"
   - Import `johnohannesian/ledgerwaitlist` from GitHub
   - Vercel will auto-detect Next.js settings

2. **Environment Variables (optional):**
   - If you want eBay API features, add `RAPIDAPI_KEY` in Vercel project settings → Environment Variables
   - Otherwise, the app works with web-researched fallback comps

3. **Deploy:**
   - Vercel will automatically deploy when you push to `main`
   - Or manually trigger: `git push origin main`

## What’s included

- **Dashboard** (`/`) — Grid of PSA cards with our value, confidence, comps, low ask. Link to **Monte Carlo & backtest**.
- **Card detail** (`/cards/[id]`) — Single card view with value and full comp list.
- **Monte Carlo & backtest** (`/simulate`) — Scope by **eBay item category**. **Load historical eBay sales** (sold listings) for that category to derive vol/drift from real trading card buys/sells, run Monte Carlo to get a bid/ask strategy, then **backtest on that same history** (or on a simulated path). Develops a market-making strategy from historical data.

## eBay categories

Simulation and backtest can be scoped to eBay’s category tree:

- **Trading Cards** (183454), **Sports Trading Cards** (261328), **Sports Trading Card Singles** (183050), **Non-Sport Trading Cards** (64482)
- **Sports Mem, Cards & Fan Shop** (44839), **Sports Memorabilia** (213)
- **Collectibles** (1)

Choose a category on the Simulate page to apply category-specific default volatility and drift, and to optionally pull a median sample price from that category. Strategy and backtest results are tagged with the category name.

## eBay Live Data API

To use live eBay data (product + category search):

1. Copy `.env.example` to `.env.local`.
2. Add your RapidAPI key: `RAPIDAPI_KEY=your_key`. The app uses [ebay32](https://rapidapi.com/ebay32-api-ebay32-api-default/api/ebay32) (product by ID). Subscribe to that API on RapidAPI; search/historical endpoints may vary by plan.
3. On **Simulate**: (optional) pick an **Item category**, then **Use category sample price** to set initial price from that category’s listings, or enter an eBay item ID to use that item’s price.

## API

- `GET /api/cards` — All seed cards with comps and determined value.
- `GET /api/cards/[id]` — One card with comps and value.
- `GET /api/ebay/categories` — List of eBay categories (id, name, defaultVolatility, defaultDrift).
- `GET /api/ebay/product?item_id=...` — Fetch eBay product (requires `RAPIDAPI_KEY`).
- `GET /api/ebay/search?category_id=...&keywords=...` — Search eBay by category; returns items with price (requires `RAPIDAPI_KEY`).
- `GET /api/ebay/historical-sales?category_id=...&keywords=...` — Fetch **sold** listings for the category (eBay LH_Sold=1). Returns `sales` (date, price, title) and `summary` (count, date range, median). Used to backtest on real trading card sales.
- `POST /api/simulate` — Run Monte Carlo; optional body: `categoryId`, `comps`, `initialPrice`, `drift`, `volatility`, `numPaths`, `horizonDays`, `seed`. When `categoryId` is set, missing drift/volatility use the category’s defaults. Returns percentiles, **strategy**, and `category`.
- `POST /api/backtest` — Backtest bid/ask strategy. Body: `bid`, `ask`, `initialCash`, optional `categoryId`/`categoryName` for labeling. Returns result plus `category`.

## Data sources (current)

- **Comps**: Mock adapter in `src/lib/sources/comps.ts`. Replace with your marketplace, eBay, PWCC, etc.
- **Population**: Mock adapter in `src/lib/sources/population.ts`. Replace with PSA pop report or API.
- **Valuation**: `src/lib/valuation.ts` — weighted recent comps, optional scarcity bump from population.

## Adding real sources

1. **Comps**: Implement `CompsSource` in `src/lib/sources/comps.ts` (e.g. fetch from your DB or an external API), then use it in `src/app/api/cards/route.ts` and `src/app/api/cards/[id]/route.ts` instead of `mockCompsSource`.
2. **Population**: Implement `PopulationSource` in `src/lib/sources/population.ts` and swap in for `mockPopulationSource`.
3. **Catalog**: Replace `seedCards` in `src/lib/catalog.ts` with data from your marketplace or CMS.

## Stack

- Next.js 14 (App Router), TypeScript, Tailwind CSS.
