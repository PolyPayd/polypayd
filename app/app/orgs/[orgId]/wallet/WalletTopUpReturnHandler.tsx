"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";

/**
 * After Stripe redirect (return_url), applies top-up via sync API so localhost works without webhooks.
 */
export function WalletTopUpReturnHandler() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const ran = useRef(false);

  useEffect(() => {
    const pi = searchParams.get("payment_intent");
    const redirectStatus = searchParams.get("redirect_status");
    if (!pi || ran.current) return;
    if (redirectStatus !== "succeeded") return;

    ran.current = true;
    (async () => {
      try {
        const res = await fetch("/api/wallet/topups/sync-payment-intent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ paymentIntentId: pi }),
        });
        if (!res.ok) {
          const j = (await res.json()) as { error?: string };
          console.error("Wallet top-up sync failed:", j.error ?? res.status);
        }
      } catch (e) {
        console.error("Wallet top-up sync error:", e);
      } finally {
        router.replace(pathname);
      }
    })();
  }, [searchParams, router, pathname]);

  return null;
}
