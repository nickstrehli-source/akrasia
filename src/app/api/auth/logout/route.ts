import { NextRequest, NextResponse } from "next/server";
import { destroySession, SESSION_COOKIE_NAME } from "@/lib/auth/session";
import { withRouteErrorLogging } from "@/lib/log";

async function handlePost(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  await destroySession(token);
  const response = NextResponse.redirect(new URL("/login", request.url), { status: 303 });
  response.cookies.delete(SESSION_COOKIE_NAME);
  return response;
}

export const POST = withRouteErrorLogging("auth/logout#POST", handlePost);
