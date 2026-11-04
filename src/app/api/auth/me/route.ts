import { NextRequest, NextResponse } from "next/server";
import { getNeoPrincipal } from "@/lib/neo-auth";

export async function GET(request: NextRequest) {
  const principal = await getNeoPrincipal(request);
  if (!principal) {
    return NextResponse.json({ ok: true, authenticated: false }, {
      headers: { "Cache-Control": "no-store" },
    });
  }
  return NextResponse.json({
    ok: true,
    authenticated: true,
    user: {
      id: principal.id,
      email: principal.email,
      fullName: principal.fullName,
      role: principal.role,
      isOwner: principal.isOwner,
      permissions: principal.permissions,
    },
  }, { headers: { "Cache-Control": "no-store" } });
}
