import { auth } from "@clerk/nextjs/server";

// Stub. Real implementation will:
//   1. requireUser() and verify ownership of the batch.
//   2. Move the batch from 'open' → 'ready_to_approve'.
//   3. Cancel any unclaimed slots.
//   4. Audit log: action='batch_closed'.
export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await ctx.params;
  return Response.json(
    {
      error: "not_implemented",
      message: "Closing batches isn't wired up yet.",
      batchId: id,
    },
    { status: 501 }
  );
}
