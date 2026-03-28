import { NextRequest, NextResponse } from "next/server";

// TODO: implement — returns authenticated user's portfolio (positions, orders, balance)
export async function GET(request: NextRequest) {
  return NextResponse.json(
    { positions: [], orders: [], balance: 0, totalValue: 0 },
    { status: 200 }
  );
}
