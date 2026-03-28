import { NextRequest, NextResponse } from "next/server";

// TODO: implement with Supabase Auth session validation
export async function GET(request: NextRequest) {
  return NextResponse.json(
    { user: null, authenticated: false },
    { status: 200 }
  );
}
