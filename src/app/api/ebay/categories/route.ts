import { NextResponse } from "next/server";
import { getEbayCategories } from "@/lib/ebay/categories";

export async function GET() {
  const categories = getEbayCategories();
  return NextResponse.json({ categories });
}
