import { NextRequest, NextResponse } from "next/server";
import {
  login,
  createSession,
  sessionCookieOptions,
  SESSION_COOKIE_NAME,
} from "@/lib/auth/session";

export async function POST(request: NextRequest) {
  const form = await request.formData();
  const email = String(form.get("email") ?? "");
  const password = String(form.get("password") ?? "");

  try {
    const operatorId = await login(email, password);
    const { token, expiresAt } = await createSession(operatorId);
    const response = NextResponse.redirect(new URL("/dashboard", request.url), { status: 303 });
    response.cookies.set(SESSION_COOKIE_NAME, token, sessionCookieOptions(expiresAt));
    return response;
  } catch {
    return NextResponse.redirect(new URL("/login?error=invalid_credentials", request.url), {
      status: 303,
    });
  }
}
