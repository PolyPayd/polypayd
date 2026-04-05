/**
 * Maps internal `batches.status` values to user-visible copy (avoid leaking raw state like `funded`).
 */
export function batchStatusDisplayLabel(status?: string | null): string {
  const s = (status ?? "unknown").toLowerCase();
  if (s === "funded") return "Ready to claim";
  if (s === "claiming") return "Claims in progress";
  if (s === "completed_with_errors") return "Completed with errors";
  if (s === "draft") return "Draft";
  if (s === "ready") return "Ready";
  if (s === "processing") return "Processing";
  if (s === "completed") return "Completed";
  if (s === "failed") return "Failed";
  return status ?? "Unknown";
}
