import { auth } from "@clerk/nextjs/server";

// Stub. Real implementation will:
//   1. requireUser() and verify ownership of the batch.
//   2. Move the batch to 'processing', kick off Crezco / Faster Payments
//      payouts for each claimed slot, and post the corresponding ledger
//      entries.
//   3. Audit log: action='batch_approved'.
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
      message: "Approving batches isn't wired up yet.",
      batchId: id,
    },
    { status: 501 }
  );
}
