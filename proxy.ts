// Required env vars:
//   ADMIN_EMAILS — comma-separated list of emails allowed to access /admin/*
//                  e.g. "alice@example.com,bob@example.com"

import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

const isPublicRoute = createRouteMatcher([
  '/',
  '/platforms',
  '/coming-soon',
  '/signup',
  '/signin',
  '/forgot-password',
  '/claim',
  '/claim/(.*)',
  '/privacy',
  '/terms',
  '/api/public/(.*)',
  '/api/webhooks/(.*)',
]);

const isAppRoute   = createRouteMatcher(['/app/(.*)', '/api/app/(.*)']);
const isAdminRoute = createRouteMatcher(['/admin/(.*)']);

const adminEmails = (): Set<string> =>
  new Set(
    (process.env.ADMIN_EMAILS ?? '')
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean)
  );

export default clerkMiddleware(async (auth, req) => {
  // Public routes — no auth required.
  if (isPublicRoute(req)) return;

  if (isAdminRoute(req)) {
    const session = await auth();

    // Not signed in → redirect to /signin.
    if (!session.userId) {
      const url = req.nextUrl.clone();
      url.pathname = '/signin';
      return NextResponse.redirect(url);
    }

    // Signed in but not on the admin allowlist → 403.
    // email is a custom claim — cast through unknown since JwtPayload doesn't
    // include it in its base type (add it via a Clerk session token template).
    const claims = session.sessionClaims as Record<string, unknown> | null;
    const email  = typeof claims?.email === 'string' ? claims.email : undefined;
    if (!email || !adminEmails().has(email.toLowerCase())) {
      return new NextResponse('Forbidden', { status: 403 });
    }

    return;
  }

  if (isAppRoute(req)) {
    const session = await auth();

    if (!session.userId) {
      const url = req.nextUrl.clone();
      url.pathname = '/signin';
      return NextResponse.redirect(url);
    }

    return;
  }

  // All other routes are public.
});

export const config = {
  matcher: ['/((?!.*\\..*|_next).*)', '/', '/(api|trpc)(.*)'],
};
