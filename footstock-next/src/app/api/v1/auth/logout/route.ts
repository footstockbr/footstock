import { NextRequest, NextResponse } from "next/server";

// TODO: implement with Supabase Auth
export async function POST(request: NextRequest) {
  return NextResponse.json(
    { error: "Not implemented" },
    { status: 501 }
  );
}
