import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// Path matchers for the protected segments.
// Everything that does NOT match these stays public by default.
const isAppRoute = createRouteMatcher(["/app", "/app/(.*)"]);
const isAdminRoute = createRouteMatcher(["/admin", "/admin/(.*)"]);

// Comma-separated list of emails allowed to reach /admin/*.
// Set via Vercel env var: ALLOWED_ADMIN_EMAILS="you@example.com,other@example.com"
// TODO: wire this into the /admin gate below once the Clerk auth implementation lands.
// const ALLOWED_ADMIN_EMAILS = (process.env.ALLOWED_ADMIN_EMAILS ?? "")
//   .split(",")
//   .map((e) => e.trim().toLowerCase())
//   .filter(Boolean);

export default clerkMiddleware(async (auth, req) => {
  // /admin/* — must be a Clerk-authenticated session whose email is on the
  // ALLOWED_ADMIN_EMAILS allowlist.
  // TODO: implement Clerk auth + email allowlist check here.
  // For now we require any signed-in session as a safe baseline.
  if (isAdminRoute(req)) {
    await auth.protect();
    return;
  }

  // /app/* — must be a Clerk-authenticated session (any signed-in user).
  // TODO: refine post-auth UX (e.g. redirect to /signin instead of Clerk default).
  if (isAppRoute(req)) {
    await auth.protect();
    return;
  }

  // All other routes are public.
});

export const config = {
  matcher: ["/((?!.*\\..*|_next).*)", "/", "/(api|trpc)(.*)"],
};
