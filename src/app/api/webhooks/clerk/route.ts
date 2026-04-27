// Required env vars: CLERK_WEBHOOK_SECRET, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
import { Webhook } from 'svix';
import { createServerClient } from '@/src/lib/db/client';
import { logAuditEvent } from '@/src/lib/audit';

export const runtime = 'nodejs';

type ClerkUserCreatedData = {
  id: string;
  email_addresses: Array<{ email_address: string; id: string }>;
  primary_email_address_id: string | null;
  first_name: string | null;
  last_name: string | null;
};

type ClerkUserDeletedData = {
  id: string;
  deleted: boolean;
};

// Keep the raw event untyped so callers explicitly cast data per branch.
// A discriminated union with a string catch-all prevents TypeScript from
// narrowing data to the specific shape after the type check.
type RawClerkEvent = { type: string; data: unknown };

export async function POST(req: Request): Promise<Response> {
  try {
    const secret = process.env.CLERK_WEBHOOK_SECRET;
    if (!secret) {
      console.error('[clerk-webhook] CLERK_WEBHOOK_SECRET not set');
      return Response.json({ error: 'misconfigured' }, { status: 500 });
    }

    const svixId        = req.headers.get('svix-id');
    const svixTimestamp = req.headers.get('svix-timestamp');
    const svixSignature = req.headers.get('svix-signature');

    if (!svixId || !svixTimestamp || !svixSignature) {
      return Response.json({ error: 'missing svix headers' }, { status: 400 });
    }

    const payload = await req.text();

    let evt: RawClerkEvent;
    try {
      evt = new Webhook(secret).verify(payload, {
        'svix-id': svixId,
        'svix-timestamp': svixTimestamp,
        'svix-signature': svixSignature,
      }) as RawClerkEvent;
    } catch {
      return Response.json({ error: 'invalid signature' }, { status: 400 });
    }

    if (evt.type === 'user.created') {
      await handleUserCreated(evt.data as ClerkUserCreatedData);
    } else if (evt.type === 'user.deleted') {
      await handleUserDeleted(evt.data as ClerkUserDeletedData);
    } else {
      console.log(`[clerk-webhook] unhandled event type: ${evt.type}`);
    }

    return Response.json({ ok: true }, { status: 200 });
  } catch (err) {
    console.error('[clerk-webhook] unexpected error:', err);
    return Response.json({ error: 'internal' }, { status: 500 });
  }
}

async function handleUserCreated(data: ClerkUserCreatedData): Promise<void> {
  const db = createServerClient();

  const email =
    data.email_addresses.find((e) => e.id === data.primary_email_address_id)
      ?.email_address ??
    data.email_addresses[0]?.email_address ??
    '';

  const firstName   = data.first_name   ?? null;
  const lastName    = data.last_name    ?? null;
  const displayName = firstName ?? email.split('@')[0];

  const { data: user, error } = await db
    .from('users')
    .upsert(
      {
        clerk_id:     data.id,
        email,
        first_name:   firstName,
        last_name:    lastName,
        display_name: displayName,
        kyc_status:   'none',
        updated_at:   new Date().toISOString(),
      },
      { onConflict: 'clerk_id' }
    )
    .select('id, clerk_id, email')
    .single();

  if (error) throw error;

  // Create a user_wallet ledger account if one doesn't already exist.
  const { data: existing } = await db
    .from('ledger_accounts')
    .select('id')
    .eq('owner_user_id', user.id)
    .eq('type', 'user_wallet')
    .maybeSingle();

  if (!existing) {
    const { error: laError } = await db.from('ledger_accounts').insert({
      type: 'user_wallet',
      owner_user_id: user.id,
    });
    if (laError) throw laError;
  }

  // Fire-and-forget — audit failure must not fail the webhook.
  void logAuditEvent({
    userId:     user.id,
    action:     'clerk.user.created',
    entityType: 'user',
    entityId:   user.id,
    metadata:   { clerk_id: user.clerk_id, email: user.email },
  });
}

async function handleUserDeleted(data: ClerkUserDeletedData): Promise<void> {
  const db = createServerClient();

  const { data: user, error: findError } = await db
    .from('users')
    .select('id, clerk_id, email')
    .eq('clerk_id', data.id)
    .maybeSingle();

  if (findError) throw findError;

  if (!user) {
    console.log(`[clerk-webhook] user.deleted: no record for clerk_id=${data.id}, skipping`);
    return;
  }

  const { error: updateError } = await db
    .from('users')
    .update({ deleted_at: new Date().toISOString() })
    .eq('clerk_id', data.id);

  if (updateError) throw updateError;

  void logAuditEvent({
    userId:     user.id,
    action:     'clerk.user.deleted',
    entityType: 'user',
    entityId:   user.id,
    metadata:   { clerk_id: user.clerk_id, email: user.email },
  });
}
