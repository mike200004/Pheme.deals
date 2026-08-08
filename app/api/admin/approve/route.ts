import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { admin } from "@/lib/supabase/admin";
import { sendApprovedEmail } from "@/lib/emails";
import { logActivity } from "@/lib/activity";

/**
 * Approve a pending owner off the private-beta waitlist.
 *
 * Until now there was NO code path that could approve an owner —
 * `setMemberStatus` deliberately scopes itself to invited assistants — so every
 * signup waited on a hand-edited database row, and the person was never told
 * they were in (`/pending` promises an email that nothing sent). That also
 * meant approval wasn't an event anything could hang off.
 *
 * POST /api/admin/approve  { "email": "them@example.com" }
 * Header: x-admin-secret (same fail-closed secret as the Stripe bootstrap).
 */
export const dynamic = "force-dynamic";

function authorized(req: NextRequest): boolean {
  const secret = process.env.ADMIN_SETUP_SECRET;
  const header = req.headers.get("x-admin-secret") ?? "";
  if (!secret || !header) return false;
  const a = Buffer.from(header);
  const b = Buffer.from(secret);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { email?: string } | null;
  const email = body?.email?.trim().toLowerCase();
  if (!email) return NextResponse.json({ error: "email is required" }, { status: 400 });

  const sb = admin();
  const { data: member, error: readErr } = await sb
    .from("account_members")
    .select("id, name, email, role, status")
    .eq("email", email)
    .eq("role", "owner")
    .maybeSingle();
  if (readErr) return NextResponse.json({ error: readErr.message }, { status: 500 });
  if (!member) return NextResponse.json({ error: "No owner account with that email." }, { status: 404 });
  if (member.status === "active") {
    return NextResponse.json({ ok: true, already: true, email, message: "Already approved." });
  }

  const { error: updErr } = await sb
    .from("account_members")
    .update({ status: "active" })
    .eq("id", member.id)
    .eq("role", "owner");
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

  // Tell them — /pending promises exactly this and nothing used to send it.
  let emailed = false;
  try {
    await sendApprovedEmail(member.email ?? email, member.name ?? "");
    emailed = true;
  } catch (err) {
    console.error("[admin] approval email failed", err);
  }
  await logActivity(member.id, "billing", "Account approved — trial started.", { actorId: member.id }).catch(
    () => {},
  );

  return NextResponse.json({ ok: true, email, name: member.name, emailed });
}
