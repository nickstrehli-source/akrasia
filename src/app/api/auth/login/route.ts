import { NextRequest, NextResponse } from "next/server";
import {
  login,
  createSession,
  sessionCookieOptions,
  SESSION_COOKIE_NAME,
  InvalidCredentialsError,
} from "@/lib/auth/session";
import { errorMessage, logServerEvent } from "@/lib/log";

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
  } catch (err) {
    if (!(err instanceof InvalidCredentialsError)) {
      await logServerEvent({ level: "error", source: "auth/login", message: errorMessage(err) });
    }
    return NextResponse.redirect(new URL("/login?error=invalid_credentials", request.url), {
      status: 303,
    });
  }
}
