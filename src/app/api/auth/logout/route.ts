import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE_NAME } from "@/lib/auth";
import { EMPLOYEE_SESSION_COOKIE_NAME, revokeEmployeeSession } from "@/lib/neo-auth";

export async function POST(request: NextRequest) {
  await revokeEmployeeSession(request.cookies.get(EMPLOYEE_SESSION_COOKIE_NAME)?.value);
  const response = NextResponse.redirect(new URL("/login", request.url), 303);

  for (const name of [SESSION_COOKIE_NAME, EMPLOYEE_SESSION_COOKIE_NAME]) {
    response.cookies.set(name, "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      maxAge: 0,
    });
  }

  response.headers.set("Cache-Control", "no-store");
  return response;
}
