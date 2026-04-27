import { createClerkClient } from '@clerk/backend';
import { createServerClient } from '@/src/lib/db/client';
import type { User } from '@/src/lib/db/types';

export async function getUserByClerkId(clerkId: string): Promise<User | null> {
  const db = createServerClient();
  const { data, error } = await db
    .from('users')
    .select('*')
    .eq('clerk_id', clerkId)
    .is('deleted_at', null)
    .returns<User>()
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function getUserById(id: string): Promise<User | null> {
  const db = createServerClient();
  const { data, error } = await db
    .from('users')
    .select('*')
    .eq('id', id)
    .is('deleted_at', null)
    .returns<User>()
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function requireUser(clerkId: string): Promise<User> {
  const user = await getUserByClerkId(clerkId);
  if (!user) {
    throw new Error(`User not found for clerk_id: ${clerkId}`);
  }
  return user;
}

export async function syncUserFromClerk(clerkId: string): Promise<User> {
  const clerk = createClerkClient({
    secretKey: process.env.CLERK_SECRET_KEY,
  });

  const clerkUser = await clerk.users.getUser(clerkId);

  const email =
    clerkUser.emailAddresses.find(
      (e) => e.id === clerkUser.primaryEmailAddressId
    )?.emailAddress ??
    clerkUser.emailAddresses[0]?.emailAddress ??
    '';

  const firstName   = clerkUser.firstName ?? null;
  const lastName    = clerkUser.lastName  ?? null;
  const displayName = firstName ?? email.split('@')[0];

  const db = createServerClient();

  const { data, error } = await db
    .from('users')
    .upsert(
      {
        clerk_id:     clerkId,
        email,
        first_name:   firstName,
        last_name:    lastName,
        display_name: displayName,
        kyc_status:   'none',
        updated_at:   new Date().toISOString(),
      },
      { onConflict: 'clerk_id' }
    )
    .select()
    .returns<User>()
    .single();

  if (error) throw error;
  return data;
}
