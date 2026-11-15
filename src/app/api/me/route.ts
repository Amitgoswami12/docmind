import { NextResponse } from "next/server";
import { handler, requireUser, DAILY_MESSAGE_LIMIT } from "@/lib/api";

export const GET = handler(async () => {
  const user = await requireUser();
  return NextResponse.json({
    user,
    dailyLimit: user.isGuest ? DAILY_MESSAGE_LIMIT.guest : DAILY_MESSAGE_LIMIT.user,
  });
});
