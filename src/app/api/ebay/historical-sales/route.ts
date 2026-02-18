import { NextResponse } from "next/server";
import { fetchHistoricalSales, isEbayConfigured } from "@/lib/ebay/client";
import { ebaySoldSearchUrl, getEbayCategoryById } from "@/lib/ebay/categories";

export async function GET(request: Request) {
  if (!isEbayConfigured()) {
    return NextResponse.json(
      { error: "RAPIDAPI_KEY not set. Add it to .env.local." },
      { status: 503 }
    );
  }
  const { searchParams } = new URL(request.url);
  const categoryId = searchParams.get("category_id");
  const keywords = searchParams.get("keywords") ?? undefined;

  if (!categoryId) {
    return NextResponse.json(
      { error: "Missing category_id query parameter." },
      { status: 400 }
    );
  }

  const category = getEbayCategoryById(categoryId);
  if (!category) {
    return NextResponse.json(
      { error: `Unknown category id: ${categoryId}. Use /api/ebay/categories for valid ids.` },
      { status: 400 }
    );
  }

  try {
    const soldUrl = ebaySoldSearchUrl({ categoryId, keywords });
    const sales = await fetchHistoricalSales(soldUrl);
    const prices = sales.map((s) => s.price).filter((p) => p > 0);
    const median =
      prices.length > 0
        ? [...prices].sort((a, b) => a - b)[Math.floor(prices.length / 2)]!
        : 0;
    const minDate = sales.length > 0 ? sales[0]!.date : null;
    const maxDate = sales.length > 0 ? sales[sales.length - 1]!.date : null;

    return NextResponse.json({
      category: { id: category.id, name: category.name },
      sales,
      summary: {
        count: sales.length,
        minDate,
        maxDate,
        medianPrice: median,
        minPrice: prices.length ? Math.min(...prices) : null,
        maxPrice: prices.length ? Math.max(...prices) : null,
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Historical sales fetch failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
