import { clerkClient, clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

// Comma-separated list of emails allowed to reach /app and any sub-route under it.
// Set via Vercel env var: ALLOWED_APP_EMAILS="you@example.com,other@example.com"
const ALLOWED_APP_EMAILS = (process.env.ALLOWED_APP_EMAILS ?? "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

const isAppRoute = createRouteMatcher(["/app", "/app/(.*)"]);

const isPublicRoute = createRouteMatcher([
  // Marketing
  "/",
  "/platforms",
  "/groups",
  "/coming-soon",

  "/sign-in(.*)",
  "/sign-up(.*)",

  // allow curl testing for CSV upload
  "/api/orgs/(.*)/batches/(.*)/upload-csv",

  // Stripe webhook must be public
  "/api/webhooks/stripe",

  "/api/webhooks/clerk",

  // Public marketing waitlist (validated + rate-limit at edge/host if needed)
  "/api/waitlist",
  "/api/waitlist/groups",

  // Admin-only manual RPC trigger (guarded by POLYPAYD_ADMIN_RELEASE_SECRET on the route)
  "/api/internal/stripe/balance-available-release",
]);

async function resolveEmail(
  userId: string,
  sessionClaims: unknown
): Promise<string | null> {
  const claims =
    sessionClaims && typeof sessionClaims === "object"
      ? (sessionClaims as Record<string, unknown>)
      : null;

  const claimsEmail =
    typeof claims?.email === "string"
      ? claims.email
      : typeof claims?.primaryEmail === "string"
        ? (claims.primaryEmail as string)
        : typeof claims?.email_address === "string"
          ? (claims.email_address as string)
          : null;

  if (claimsEmail) return claimsEmail.trim().toLowerCase();

  try {
    const client = await clerkClient();
    const user = await client.users.getUser(userId);
    const primary =
      user.primaryEmailAddress?.emailAddress ?? user.emailAddresses[0]?.emailAddress ?? null;
    return primary ? primary.trim().toLowerCase() : null;
  } catch {
    return null;
  }
}

function redirectToComingSoon(req: Request): NextResponse {
  const url = new URL("/coming-soon", req.url);
  return NextResponse.redirect(url);
}

export default clerkMiddleware(async (auth, req) => {
  // Founder-only gate for the /app prototype.
  if (isAppRoute(req)) {
    const { userId, sessionClaims } = await auth();

    if (!userId) {
      return redirectToComingSoon(req);
    }

    const email = await resolveEmail(userId, sessionClaims);

    if (!email || !ALLOWED_APP_EMAILS.includes(email)) {
      return redirectToComingSoon(req);
    }

    return;
  }

  if (!isPublicRoute(req)) await auth.protect();
});

export const config = {
  matcher: ["/((?!.*\\..*|_next).*)", "/", "/(api|trpc)(.*)"],
};
