import { NextResponse } from "next/server";
import { searchEbayByUrl, isEbayConfigured } from "@/lib/ebay/client";
import { ebaySearchUrl, getEbayCategoryById } from "@/lib/ebay/categories";

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
    const url = ebaySearchUrl({ categoryId, keywords });
    const items = await searchEbayByUrl(url);
    return NextResponse.json({
      category: { id: category.id, name: category.name },
      url,
      items,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "eBay search failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
