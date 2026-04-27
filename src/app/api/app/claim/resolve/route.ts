// Stub — claim resolution not yet implemented.
// Returns 404 so ClaimCodeInput can show the "not found" error message.
export async function POST(): Promise<Response> {
  return Response.json({ error: "not_found" }, { status: 404 });
}
