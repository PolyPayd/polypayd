import { createServerClient } from '@/src/lib/db/client';

export async function logAuditEvent(params: {
  userId?: string;
  action: string;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
}): Promise<void> {
  try {
    const db = createServerClient();
    await db.from('audit_logs').insert({
      user_id: params.userId ?? null,
      action: params.action,
      entity_type: params.entityType ?? null,
      entity_id: params.entityId ?? null,
      metadata: params.metadata ?? null,
      ip_address: params.ipAddress ?? null,
    });
  } catch (err) {
    // Audit failure must never break the caller.
    console.error('[audit] failed to write audit log:', err);
  }
}
