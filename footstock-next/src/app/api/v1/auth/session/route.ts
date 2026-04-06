import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";

export async function GET() {
  try {
    const auth = await getAuthUser();
    if (!auth) {
      return NextResponse.json({ user: null, authenticated: false });
    }
    return NextResponse.json({ user: auth.user, authenticated: true });
  } catch {
    return NextResponse.json({ user: null, authenticated: false });
  }
}
