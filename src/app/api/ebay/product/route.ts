import { NextResponse } from "next/server";
import { fetchEbayProduct, isEbayConfigured } from "@/lib/ebay/client";

export async function GET(request: Request) {
  if (!isEbayConfigured()) {
    return NextResponse.json(
      { error: "RAPIDAPI_KEY not set. Add it to .env.local." },
      { status: 503 }
    );
  }
  const { searchParams } = new URL(request.url);
  const itemId = searchParams.get("item_id");
  if (!itemId) {
    return NextResponse.json(
      { error: "Missing item_id query parameter." },
      { status: 400 }
    );
  }
  try {
    const product = await fetchEbayProduct(itemId);
    if (!product) {
      return NextResponse.json({ error: "Product not found." }, { status: 404 });
    }
    return NextResponse.json(product);
  } catch (e) {
    const message = e instanceof Error ? e.message : "eBay API error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
