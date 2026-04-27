import "server-only";

import { supabaseAdmin } from "@/lib/supabaseAdmin";

// Append-only audit log writer. Failures are swallowed so a logging error
// can never block a user-facing request.

export type AuditEvent = {
  userId?: string | null;
  action: string;
  entityType?: string | null;
  entityId?: string | null;
  metadata?: Record<string, unknown> | null;
  ipAddress?: string | null;
};

export async function logAuditEvent(event: AuditEvent): Promise<void> {
  try {
    await supabaseAdmin()
      .from("audit_logs")
      .insert({
        user_id: event.userId ?? null,
        action: event.action,
        entity_type: event.entityType ?? null,
        entity_id: event.entityId ?? null,
        metadata: event.metadata ?? null,
        ip_address: event.ipAddress ?? null,
      });
  } catch (err) {
    console.error("logAuditEvent failed:", err);
  }
}
