import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

type Params = Promise<{ orgId: string }>;

export default async function OrgLayout({
  params: _params,
  children: _children,
}: {
  params: Params;
  children: React.ReactNode;
}) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  // Organisations are deprecated: always route users into the simplified single-wallet UX.
  redirect("/app/wallet");
}
