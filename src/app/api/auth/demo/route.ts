import { NextResponse } from "next/server";
import { handler } from "@/lib/api";
import { createSession } from "@/lib/auth";
import { createGuestWithDemoData } from "@/lib/demo";

/** "Try the demo" button: signs the visitor in as a fresh guest with sample documents. */
export const POST = handler(async () => {
  const guest = await createGuestWithDemoData();
  await createSession(guest.id);
  return NextResponse.json({ ok: true });
});
