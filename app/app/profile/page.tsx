import type { ReactNode } from "react";
import Link from "next/link";
import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { FintechCard } from "@/components/fintech";

export const dynamic = "force-dynamic";

function moneyGBP(n: unknown) {
  const num = Number(n ?? 0);
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(num);
}

const label = "text-xs font-medium text-[#6B7280]";
const value = "text-sm font-medium text-[#F9FAFB]";

function Detail({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div>
      <div className={label}>{k}</div>
      <div className={`mt-1 ${value}`}>{v}</div>
    </div>
  );
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
    .select("current_balance, pending_balance, currency")
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
    <div className="mx-auto w-full max-w-2xl px-4 py-8 sm:px-5 sm:py-10">
      <h1 className="text-xl font-semibold tracking-tight text-[#F9FAFB] sm:text-2xl">Profile</h1>
      <p className="mt-1 text-sm text-[#6B7280]">Your account and wallet overview.</p>

      {/* Hero: wallet */}
      <FintechCard elevated interactive={false} className="mt-8 p-5 sm:p-6">
        <p className="text-xs font-medium text-[#6B7280]">Available balance</p>
        <p className="mt-2 text-[2rem] font-bold tabular-nums tracking-tight text-[#F9FAFB] sm:text-[2.25rem]">
          {moneyGBP(wallet?.current_balance ?? 0)}
        </p>
        <div className="mt-6 flex flex-wrap gap-x-10 gap-y-4 border-t border-white/[0.05] pt-6">
          <div>
            <p className={label}>Pending</p>
            <p className="mt-1 text-base font-semibold tabular-nums text-[#9CA3AF]">{moneyGBP(wallet?.pending_balance ?? 0)}</p>
          </div>
          <div>
            <p className={label}>Total sent</p>
            <p className="mt-1 text-base font-semibold tabular-nums text-[#F9FAFB]">{moneyGBP(totalSent)}</p>
            <p className="mt-0.5 text-xs text-[#6B7280]">From completed payouts you funded</p>
          </div>
          <div>
            <p className={label}>Currency</p>
            <p className="mt-1 text-base font-semibold text-[#F9FAFB]">{wallet?.currency ?? "GBP"}</p>
          </div>
        </div>
      </FintechCard>

      <FintechCard interactive={false} className="mt-5 p-4 sm:p-5">
        <h2 className="text-sm font-semibold text-[#F9FAFB]">Identity</h2>
        <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-3">
          <Detail k="Full name" v={user?.fullName || "Not set"} />
          <Detail k="Email" v={user?.primaryEmailAddress?.emailAddress || "Not set"} />
          <Detail k="Account type" v={<span className="capitalize">{accountType}</span>} />
        </div>
      </FintechCard>

      {accountType === "business" && (
        <FintechCard interactive={false} className="mt-5 p-4 sm:p-5">
          <h2 className="text-sm font-semibold text-[#F9FAFB]">Business</h2>
          <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2">
            <Detail k="Business name" v={businessName || "Not set"} />
            <Detail k="Registration ID" v={businessId || "Not set"} />
          </div>
        </FintechCard>
      )}

      <div className="mt-5 flex flex-col gap-3 rounded-2xl border border-white/[0.05] bg-[#121821] px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <p className="text-sm text-[#9CA3AF]">Change password in your account security settings.</p>
        <Link
          href="/user"
          className="inline-flex min-h-10 shrink-0 items-center justify-center self-end rounded-xl border border-white/[0.08] bg-[#161F2B] px-4 text-sm font-semibold text-[#F9FAFB] transition-colors hover:border-white/[0.12] hover:bg-[#1a2433] sm:self-auto"
        >
          Change password
        </Link>
      </div>

      <FintechCard interactive={false} className="mt-5 p-4 sm:p-5">
        <h2 className="text-sm font-semibold text-[#F9FAFB]">Activity summary</h2>
        <div className="mt-5 grid grid-cols-1 gap-6 sm:grid-cols-3 sm:gap-4">
          <div>
            <p className={label}>Total payouts</p>
            <p className="mt-1 text-lg font-bold tabular-nums text-[#F9FAFB]">{totalPayouts}</p>
          </div>
          <div>
            <p className={label}>Total recipients</p>
            <p className="mt-1 text-lg font-bold tabular-nums text-[#F9FAFB]">{totalRecipients}</p>
          </div>
          <div>
            <p className={label}>Last payout</p>
            <p className="mt-1 text-sm font-medium text-[#F9FAFB]">
              {lastPayoutDate ? new Date(lastPayoutDate).toLocaleDateString("en-GB") : "No payouts yet"}
            </p>
          </div>
        </div>
      </FintechCard>
    </div>
  );
}
