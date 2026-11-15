import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { DAILY_MESSAGE_LIMIT } from "@/lib/api";
import { Workspace } from "@/components/workspace/Workspace";

export const metadata = { title: "Workspace · DocMind" };
export const dynamic = "force-dynamic";

export default async function WorkspacePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return (
    <Workspace
      user={user}
      dailyLimit={user.isGuest ? DAILY_MESSAGE_LIMIT.guest : DAILY_MESSAGE_LIMIT.user}
    />
  );
}
