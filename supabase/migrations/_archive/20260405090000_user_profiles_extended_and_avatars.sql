-- Extended Clerk-linked profiles + public avatar storage (uploads via service role from app API).

CREATE TABLE IF NOT EXISTS public.profiles (
  clerk_user_id text PRIMARY KEY,
  email text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS full_name text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS address_line_1 text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS address_line_2 text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS city text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS postcode text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS country text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS avatar_url text;

COMMENT ON TABLE public.profiles IS 'Extended profile for Clerk users; synced on signup via webhook; app API updates details and avatar_url.';
COMMENT ON COLUMN public.profiles.avatar_url IS 'Public URL for custom avatar (Supabase Storage); optional.';

CREATE INDEX IF NOT EXISTS profiles_email_idx ON public.profiles (email);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- No policies: anon/authenticated Supabase JWT cannot access; service role (app server) bypasses RLS.

INSERT INTO storage.buckets (id, name, public)
VALUES ('profile-avatars', 'profile-avatars', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "profile_avatars_public_read" ON storage.objects;

CREATE POLICY "profile_avatars_public_read"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'profile-avatars');
