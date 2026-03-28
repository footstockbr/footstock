import { NextRequest, NextResponse } from "next/server";

// TODO: implement — returns paginated list of club assets with real-time prices
export async function GET(request: NextRequest) {
  return NextResponse.json(
    { assets: [], total: 0, page: 1 },
    { status: 200 }
  );
}
