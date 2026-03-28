import { NextRequest, NextResponse } from "next/server";

// TODO: implement — returns single asset detail, OHLCV history, order book snapshot
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const { ticker } = await params;
  return NextResponse.json(
    { error: "Not implemented", ticker },
    { status: 501 }
  );
}
