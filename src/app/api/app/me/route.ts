import { auth } from "@clerk/nextjs/server";
import { getUserByClerkId } from "@/src/lib/users";

export async function GET(): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const user = await getUserByClerkId(userId);
  if (!user) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }

  return Response.json({ user });
}
