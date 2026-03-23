import Link from "next/link";
import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

function moneyGBP(n: unknown) {
  const num = Number(n ?? 0);
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(num);
}

function cardClassName() {
  return "rounded-xl border border-neutral-800 bg-neutral-900/50 p-5";
}

export default async function ProfilePage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const user = await currentUser();
  const supabase = supabaseAdmin();

  const accountTypeRaw = String((user?.publicMetadata?.accountType as string | undefined) ?? "personal").toLowerCase();
  const accountType = accountTypeRaw === "business" ? "business" : "personal";
  const businessName = String((user?.publicMetadata?.businessName as string | undefined) ?? "").trim();
  const businessId = String((user?.publicMetadata?.businessId as string | undefined) ?? "").trim();

  const { data: wallet } = await supabase
    .from("wallets")
    .select("current_balance, currency")
    .eq("user_id", userId)
    .eq("currency", "GBP")
    .maybeSingle();

  const { data: completedBatches } = await supabase
    .from("batches")
    .select("id, total_amount, recipient_count, created_at")
    .eq("funded_by_user_id", userId)
    .in("status", ["completed", "completed_with_errors"]);

  const totalSent = (completedBatches ?? []).reduce((sum, b) => sum + Number(b.total_amount ?? 0), 0);
  const totalPayouts = completedBatches?.length ?? 0;
  const totalRecipients = (completedBatches ?? []).reduce((sum, b) => sum + Number(b.recipient_count ?? 0), 0);
  const lastPayoutDate =
    (completedBatches ?? [])
      .map((b) => b.created_at)
      .filter(Boolean)
      .sort()
      .reverse()[0] ?? null;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-white">Profile</h1>
      </div>

      <section className={cardClassName()}>
        <h2 className="text-sm font-medium text-neutral-400">Identity</h2>
        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
          <div>
            <div className="text-xs text-neutral-500">Full name</div>
            <div className="text-sm text-neutral-100">{user?.fullName || "Not set"}</div>
          </div>
          <div>
            <div className="text-xs text-neutral-500">Email</div>
            <div className="text-sm text-neutral-100">{user?.primaryEmailAddress?.emailAddress || "Not set"}</div>
          </div>
          <div>
            <div className="text-xs text-neutral-500">Account type</div>
            <div className="text-sm capitalize text-neutral-100">{accountType}</div>
          </div>
        </div>
      </section>

      <section className={cardClassName()}>
        <h2 className="text-sm font-medium text-neutral-400">Wallet Snapshot</h2>
        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
          <div>
            <div className="text-xs text-neutral-500">Current balance</div>
            <div className="text-lg font-semibold text-white">{moneyGBP(wallet?.current_balance ?? 0)}</div>
          </div>
          <div>
            <div className="text-xs text-neutral-500">Total sent</div>
            <div className="text-lg font-semibold text-white">{moneyGBP(totalSent)}</div>
          </div>
          <div>
            <div className="text-xs text-neutral-500">Currency</div>
            <div className="text-sm text-neutral-100">{wallet?.currency ?? "GBP"}</div>
          </div>
        </div>
      </section>

      {accountType === "business" && (
        <section className={cardClassName()}>
          <h2 className="text-sm font-medium text-neutral-400">Business Details</h2>
          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <div className="text-xs text-neutral-500">Business name</div>
              <div className="text-sm text-neutral-100">{businessName || "Not set"}</div>
            </div>
            <div>
              <div className="text-xs text-neutral-500">Registration ID</div>
              <div className="text-sm text-neutral-100">{businessId || "Not set"}</div>
            </div>
          </div>
        </section>
      )}

      <section className={cardClassName()}>
        <h2 className="text-sm font-medium text-neutral-400">Security</h2>
        <div className="mt-3 flex items-center justify-between gap-3">
          <p className="text-sm text-neutral-300">Change password from your account security settings.</p>
          <Link
            href="/user"
            className="rounded-md border border-neutral-700 px-3 py-2 text-sm text-neutral-100 hover:border-neutral-600"
          >
            Change password
          </Link>
        </div>
      </section>

      <section className={cardClassName()}>
        <h2 className="text-sm font-medium text-neutral-400">Activity Summary</h2>
        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
          <div>
            <div className="text-xs text-neutral-500">Total payouts</div>
            <div className="text-lg font-semibold text-white">{totalPayouts}</div>
          </div>
          <div>
            <div className="text-xs text-neutral-500">Total recipients</div>
            <div className="text-lg font-semibold text-white">{totalRecipients}</div>
          </div>
          <div>
            <div className="text-xs text-neutral-500">Last payout date</div>
            <div className="text-sm text-neutral-100">
              {lastPayoutDate ? new Date(lastPayoutDate).toLocaleDateString("en-GB") : "No payouts yet"}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

