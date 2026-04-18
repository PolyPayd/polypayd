import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isPublicRoute = createRouteMatcher([
  // Marketing
  "/",

  "/sign-in(.*)",
  "/sign-up(.*)",

  // Recipient flows (pages gate actions with auth(); must load while signed out)
  "/app/join-batch(.*)",
  "/app/claim(.*)",
  "/app/claim-payout(.*)",

  // allow curl testing for CSV upload
  "/api/orgs/(.*)/batches/(.*)/upload-csv",

  // Stripe webhook must be public
  "/api/webhooks/stripe",

  "/api/webhooks/clerk",

  // Admin-only manual RPC trigger (guarded by POLYPAYD_ADMIN_RELEASE_SECRET on the route)
  "/api/internal/stripe/balance-available-release",
]);

export default clerkMiddleware(async (auth, req) => {
  if (!isPublicRoute(req)) await auth.protect();
});

export const config = {
  matcher: ["/((?!.*\\..*|_next).*)", "/", "/(api|trpc)(.*)"],
};
