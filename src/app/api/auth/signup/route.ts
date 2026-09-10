import { NextRequest, NextResponse } from "next/server";
import { acceptInvite, InviteError } from "@/lib/auth/invite";
import { createSession, sessionCookieOptions, SESSION_COOKIE_NAME } from "@/lib/auth/session";

export async function POST(request: NextRequest) {
  const form = await request.formData();
  const token = String(form.get("token") ?? "");
  const name = String(form.get("name") ?? "");
  const password = String(form.get("password") ?? "");

  try {
    const { operatorId } = await acceptInvite({ token, name, password });
    const { token: sessionToken, expiresAt } = await createSession(operatorId);
    const response = NextResponse.redirect(new URL("/dashboard", request.url), { status: 303 });
    response.cookies.set(SESSION_COOKIE_NAME, sessionToken, sessionCookieOptions(expiresAt));
    return response;
  } catch (err) {
    const message = err instanceof InviteError ? err.message : "Signup failed";
    const url = new URL("/signup", request.url);
    url.searchParams.set("token", token);
    url.searchParams.set("error", message);
    return NextResponse.redirect(url, { status: 303 });
  }
}
