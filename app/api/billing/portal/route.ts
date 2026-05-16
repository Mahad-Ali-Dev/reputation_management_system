import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { createPortalSession } from "@/lib/billing/actions";

export async function POST() {
  const session = await auth();
  const orgId = (session as { orgId?: string } | null)?.orgId;
  if (!session || !orgId) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  try {
    const url = await createPortalSession(orgId);
    return NextResponse.json({ url });
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error }, { status: 500 });
  }
}
