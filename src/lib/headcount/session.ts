import "server-only";

import { auth } from "@/auth";
import type { SessionUser } from "@/lib/headcount/db/present";

export async function currentUser(): Promise<SessionUser | null> {
  const session = await auth();
  const user = session?.user;
  if (!user?.id || !user.role) return null;
  return {
    id: user.id,
    name: user.name ?? "",
    role: user.role,
    departmentIds: user.departmentIds ?? [],
  };
}
