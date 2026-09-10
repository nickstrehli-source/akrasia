import { NextRequest, NextResponse } from "next/server";
import { getSessionOperator, SESSION_COOKIE_NAME } from "@/lib/auth/session";
import { createInvite, InviteError } from "@/lib/auth/invite";
import { ForbiddenError } from "@/lib/auth/access";
import { withRouteErrorLogging } from "@/lib/log";

// Existing operator invites a new operator to a chosen subset of the
// properties they themselves have access to. No email provider is wired up
// yet (that's a new vendor dependency — CEO sign-off first), so the invite
// link is returned directly to the inviting operator to share by hand.
async function handlePost(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = await getSessionOperator(token);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const form = await request.formData();
  const email = String(form.get("email") ?? "");
  const propertyIds = form.getAll("propertyIds").map(String);

  try {
    const { token: inviteToken, expiresAt } = await createInvite({
      invitedByOperatorId: session.operatorId,
      email,
      propertyIds,
    });
    const inviteUrl = new URL(`/signup?token=${inviteToken}`, request.url).toString();

    const html = `<!doctype html>
<meta charset="utf-8">
<title>Invite sent</title>
<main style="max-width:640px;margin:2rem auto;font-family:system-ui,sans-serif;padding:0 1rem;">
  <h1>Invite created</h1>
  <p>Share this link with the invitee. It expires ${expiresAt.toISOString()} and can be used once.</p>
  <p><a href="${inviteUrl}">${inviteUrl}</a></p>
  <p><a href="/dashboard">Back to dashboard</a></p>
</main>`;
    return new NextResponse(html, { headers: { "content-type": "text/html; charset=utf-8" } });
  } catch (err) {
    if (err instanceof ForbiddenError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    if (err instanceof InviteError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }
}

export const POST = withRouteErrorLogging("operators/invite#POST", handlePost);
