This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Environment variables

### `ALLOWED_APP_EMAILS` (required for `/app` access)

`proxy.ts` (Next.js 16's replacement for `middleware.ts`) gates the founder-only prototype at `/app` (and every sub-route) to a comma-separated allowlist of Clerk account emails. Anyone signed out, or signed in with any other email, is redirected to `/coming-soon`.

Set this in **Vercel → Project → Settings → Environment Variables** for each environment (Production, Preview, Development):

```
ALLOWED_APP_EMAILS=founder@example.com,other@example.com
```

Emails are matched case-insensitively and compared against the user's primary Clerk email. Leave the variable unset (or empty) to lock `/app` to nobody.

The rest of the site (`/`, `/platforms`, `/groups` (301 → `/`), `/coming-soon`, `/sign-in`, `/api/waitlist`, Stripe webhook, etc.) remains fully public regardless of this variable.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
