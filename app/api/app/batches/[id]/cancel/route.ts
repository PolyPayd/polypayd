import { auth } from "@clerk/nextjs/server";

// Stub. Real implementation will:
//   1. requireUser() and verify ownership of the batch.
//   2. Move the batch to 'cancelled', release any held slots, refund the
//      sender's wallet, and notify any waiting recipients.
//   3. Audit log: action='batch_cancelled'.
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
      message: "Cancelling batches isn't wired up yet.",
      batchId: id,
    },
    { status: 501 }
  );
}
