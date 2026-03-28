import { NextRequest, NextResponse } from "next/server";

// TODO: implement — place buy/sell order (limit or market), validates plan limits
export async function POST(request: NextRequest) {
  return NextResponse.json(
    { error: "Not implemented" },
    { status: 501 }
  );
}

// TODO: implement — list user's open and historical orders
export async function GET(request: NextRequest) {
  return NextResponse.json(
    { orders: [], total: 0 },
    { status: 200 }
  );
}
