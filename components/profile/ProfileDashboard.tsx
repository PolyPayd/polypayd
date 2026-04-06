"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { FintechButton, FintechInput } from "@/components/fintech";
import { formatProfileAddressLines } from "@/lib/profileFieldValidation";
import type { UserProfileRecord } from "@/lib/userProfileTypes";
import { ProfileAvatar } from "./ProfileAvatar";
import { ProfileRow } from "./ProfileRow";
import { ProfileSection } from "./ProfileSection";

type Props = {
  initialProfile: UserProfileRecord | null;
  email: string;
  clerkDisplayName: string;
  clerkImageUrl: string | null;
  clerkPhone: string;
  accountType: "personal" | "business";
  businessName: string;
  businessId: string;
};

export function ProfileDashboard({
  initialProfile,
  email,
  clerkDisplayName,
  clerkImageUrl,
  clerkPhone,
  accountType,
  businessName,
  businessId,
}: Props) {
  const router = useRouter();
  const [profile, setProfile] = useState<UserProfileRecord | null>(initialProfile);
  const fileRef = useRef<HTMLInputElement>(null);

  const [sheetAvatar, setSheetAvatar] = useState(false);
  const [viewPhoto, setViewPhoto] = useState(false);
  const [editName, setEditName] = useState(false);
  const [editPhone, setEditPhone] = useState(false);
  const [editAddress, setEditAddress] = useState(false);

  const [nameDraft, setNameDraft] = useState("");
  const [phoneDraft, setPhoneDraft] = useState("");
  const [addr1, setAddr1] = useState("");
  const [addr2, setAddr2] = useState("");
  const [addrCity, setAddrCity] = useState("");
  const [addrPost, setAddrPost] = useState("");
  const [addrCountry, setAddrCountry] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setProfile(initialProfile);
  }, [initialProfile]);

  const displayName = useMemo(() => {
    const p = profile?.full_name?.trim();
    if (p) return p;
    const c = clerkDisplayName.trim();
    if (c && c !== "Not set") return c;
    return "Account";
  }, [profile, clerkDisplayName]);

  const effectiveAvatarUrl = profile?.avatar_url?.trim() || clerkImageUrl || null;

  const phoneDisplay = useMemo(() => {
    const p = profile?.phone?.trim();
    if (p) return p;
    if (clerkPhone) return clerkPhone;
    return "Not set";
  }, [profile, clerkPhone]);

  const addressDisplay = useMemo(() => {
    if (!profile) return "Not set";
    const f = formatProfileAddressLines(profile);
    return f || "Not set";
  }, [profile]);

  const openName = () => {
    setNameDraft(displayName === "Account" ? "" : displayName);
    setEditName(true);
  };

  const openPhone = () => {
    setPhoneDraft(profile?.phone?.trim() ?? clerkPhone ?? "");
    setEditPhone(true);
  };

  const openAddress = () => {
    setAddr1(profile?.address_line_1 ?? "");
    setAddr2(profile?.address_line_2 ?? "");
    setAddrCity(profile?.city ?? "");
    setAddrPost(profile?.postcode ?? "");
    setAddrCountry(profile?.country ?? "");
    setEditAddress(true);
  };

  const patchProfile = useCallback(async (body: Record<string, unknown>) => {
    setSaving(true);
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = (await res.json()) as { error?: string; profile?: UserProfileRecord };
      if (!res.ok) {
        toast.error(j.error ?? "Could not save");
        return false;
      }
      if (j.profile) setProfile(j.profile);
      router.refresh();
      return true;
    } catch {
      toast.error("Network error");
      return false;
    } finally {
      setSaving(false);
    }
  }, [router]);

  const saveName = async () => {
    const ok = await patchProfile({ fullName: nameDraft });
    if (ok) {
      toast.success("Name updated");
      setEditName(false);
    }
  };

  const savePhone = async () => {
    const ok = await patchProfile({ phone: phoneDraft });
    if (ok) {
      toast.success("Phone number updated");
      setEditPhone(false);
    }
  };

  const saveAddress = async () => {
    const ok = await patchProfile({
      address: {
        line1: addr1,
        line2: addr2,
        city: addrCity,
        postcode: addrPost,
        country: addrCountry,
      },
    });
    if (ok) {
      toast.success("Address updated");
      setEditAddress(false);
    }
  };

  const onPickAvatar = () => {
    setSheetAvatar(false);
    fileRef.current?.click();
  };

  const onAvatarFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setSaving(true);
    try {
      const fd = new FormData();
      fd.set("file", file);
      const res = await fetch("/api/profile/avatar", { method: "POST", body: fd });
      const j = (await res.json()) as { error?: string; avatarUrl?: string };
      if (!res.ok) {
        toast.error(j.error ?? "Upload failed");
        return;
      }
      if (j.avatarUrl) {
        setProfile((p) => (p ? { ...p, avatar_url: j.avatarUrl! } : p));
        toast.success("Profile photo updated");
        router.refresh();
      }
    } catch {
      toast.error("Network error");
    } finally {
      setSaving(false);
    }
  };

  const removeAvatar = async () => {
    setSheetAvatar(false);
    setSaving(true);
    try {
      const res = await fetch("/api/profile/avatar", { method: "DELETE" });
      const j = (await res.json()) as { error?: string };
      if (!res.ok) {
        toast.error(j.error ?? "Could not remove photo");
        return;
      }
      setProfile((p) => (p ? { ...p, avatar_url: null } : p));
      toast.success("Profile photo removed");
      router.refresh();
    } catch {
      toast.error("Network error");
    } finally {
      setSaving(false);
    }
  };

  const accountTypeLabel = accountType === "business" ? "Business" : "Personal";
  const secondaryLine = email || "";

  return (
    <div className="mx-auto w-full max-w-lg px-4 pb-12 pt-6 sm:px-5 sm:pt-8">
      <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden" onChange={onAvatarFile} />

      <header className="flex flex-col items-center text-center">
        <ProfileAvatar
          name={displayName}
          email={email || "user"}
          imageUrl={effectiveAvatarUrl}
          onPress={() => setSheetAvatar(true)}
        />
        <h1 className="mt-5 text-[1.375rem] font-bold tracking-tight text-[#F9FAFB] sm:text-2xl">{displayName}</h1>
        {secondaryLine ? <p className="mt-1.5 text-sm text-[#9CA3AF]">{secondaryLine}</p> : null}
      </header>

      <ProfileSection title="Personal">
        <ProfileRow variant="button" label="Name" value={displayName} onClick={openName} />
        <ProfileRow variant="link" label="Email" value={email || "Not set"} href="/app/user" />
        <ProfileRow variant="static" label="Account type" value={accountTypeLabel} />
      </ProfileSection>

      {accountType === "business" ? (
        <ProfileSection title="Business">
          <ProfileRow variant="static" label="Business name" value={businessName || "Not set"} />
          <ProfileRow variant="static" label="Registration ID" value={businessId || "Not set"} />
        </ProfileSection>
      ) : null}

      <ProfileSection title="Contact details">
        <ProfileRow variant="button" label="Phone number" value={phoneDisplay} onClick={openPhone} />
        <ProfileRow variant="button" label="Address" value={addressDisplay} onClick={openAddress} />
      </ProfileSection>

      <ProfileSection title="Security">
        <ProfileRow variant="link" label="Password & security" value="Manage password, sessions, and devices" href="/app/user" />
      </ProfileSection>

      {/* Avatar action sheet */}
      {sheetAvatar ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center sm:p-4" role="dialog" aria-modal>
          <button type="button" className="absolute inset-0 cursor-default" aria-label="Dismiss" onClick={() => setSheetAvatar(false)} />
          <div className="relative z-10 w-full max-w-md rounded-t-2xl border border-white/[0.08] bg-[#121821] p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] shadow-xl sm:rounded-2xl sm:p-3">
            <p className="px-3 py-2 text-center text-xs font-medium uppercase tracking-wide text-[#6B7280]">Profile photo</p>
            {effectiveAvatarUrl ? (
              <>
                <button
                  type="button"
                  className="flex w-full rounded-xl px-4 py-3.5 text-left text-[15px] font-medium text-[#F9FAFB] transition-colors hover:bg-white/[0.05]"
                  onClick={() => {
                    setSheetAvatar(false);
                    setViewPhoto(true);
                  }}
                >
                  View photo
                </button>
                <button
                  type="button"
                  className="flex w-full rounded-xl px-4 py-3.5 text-left text-[15px] font-medium text-[#F9FAFB] transition-colors hover:bg-white/[0.05]"
                  onClick={onPickAvatar}
                >
                  Upload new photo
                </button>
                <button
                  type="button"
                  className="flex w-full rounded-xl px-4 py-3.5 text-left text-[15px] font-medium text-[#FCA5A5] transition-colors hover:bg-white/[0.05]"
                  onClick={removeAvatar}
                  disabled={saving}
                >
                  Remove photo
                </button>
              </>
            ) : (
              <button
                type="button"
                className="flex w-full rounded-xl px-4 py-3.5 text-left text-[15px] font-medium text-[#F9FAFB] transition-colors hover:bg-white/[0.05]"
                onClick={onPickAvatar}
              >
                Upload photo
              </button>
            )}
            <button
              type="button"
              className="mt-1 flex w-full rounded-xl px-4 py-3.5 text-left text-[15px] font-medium text-[#9CA3AF] transition-colors hover:bg-white/[0.05]"
              onClick={() => setSheetAvatar(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {viewPhoto && effectiveAvatarUrl ? (
        <div className="fixed inset-0 z-[60] flex flex-col bg-black/90 p-4" role="dialog" aria-modal>
          <div className="flex justify-end">
            <button
              type="button"
              className="rounded-lg px-3 py-2 text-sm font-medium text-[#F9FAFB] hover:bg-white/10"
              onClick={() => setViewPhoto(false)}
            >
              Close
            </button>
          </div>
          <div className="flex flex-1 items-center justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={effectiveAvatarUrl} alt="" className="max-h-[85vh] max-w-full rounded-lg object-contain" />
          </div>
        </div>
      ) : null}

      {editName ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center sm:p-4" role="dialog" aria-modal>
          <button type="button" className="absolute inset-0 cursor-default" aria-label="Dismiss" onClick={() => setEditName(false)} />
          <div className="relative z-10 w-full max-w-md rounded-t-2xl border border-white/[0.08] bg-[#121821] p-5 shadow-xl sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold text-[#F9FAFB]">Edit name</h2>
            <p className="mt-1 text-sm text-[#6B7280]">This updates how you appear across PolyPayd.</p>
            <label htmlFor="profile-name" className="mt-4 mb-2 block text-xs font-medium text-[#9CA3AF]">
              Full name
            </label>
            <FintechInput id="profile-name" value={nameDraft} onChange={(e) => setNameDraft(e.target.value)} placeholder="Your name" autoFocus />
            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <FintechButton type="button" variant="secondary" className="min-h-12" onClick={() => setEditName(false)}>
                Cancel
              </FintechButton>
              <FintechButton type="button" className="min-h-12" onClick={saveName} disabled={saving}>
                Save
              </FintechButton>
            </div>
          </div>
        </div>
      ) : null}

      {editPhone ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center sm:p-4" role="dialog" aria-modal>
          <button type="button" className="absolute inset-0 cursor-default" aria-label="Dismiss" onClick={() => setEditPhone(false)} />
          <div className="relative z-10 w-full max-w-md rounded-t-2xl border border-white/[0.08] bg-[#121821] p-5 shadow-xl sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold text-[#F9FAFB]">Phone number</h2>
            <p className="mt-1 text-sm text-[#6B7280]">Stored on your PolyPayd profile. Leave blank to clear.</p>
            <label htmlFor="profile-phone" className="mt-4 mb-2 block text-xs font-medium text-[#9CA3AF]">
              Phone
            </label>
            <FintechInput
              id="profile-phone"
              type="tel"
              inputMode="tel"
              value={phoneDraft}
              onChange={(e) => setPhoneDraft(e.target.value)}
              placeholder="+44 …"
              autoFocus
            />
            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <FintechButton type="button" variant="secondary" className="min-h-12" onClick={() => setEditPhone(false)}>
                Cancel
              </FintechButton>
              <FintechButton type="button" className="min-h-12" onClick={savePhone} disabled={saving}>
                Save
              </FintechButton>
            </div>
          </div>
        </div>
      ) : null}

      {editAddress ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center sm:p-4" role="dialog" aria-modal>
          <button type="button" className="absolute inset-0 cursor-default" aria-label="Dismiss" onClick={() => setEditAddress(false)} />
          <div className="relative z-10 max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-2xl border border-white/[0.08] bg-[#121821] p-5 shadow-xl sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold text-[#F9FAFB]">Address</h2>
            <p className="mt-1 text-sm text-[#6B7280]">Your contact address on file.</p>
            <div className="mt-4 space-y-3">
              {(
                [
                  ["Line 1", addr1, setAddr1, "address1"],
                  ["Line 2 (optional)", addr2, setAddr2, "address2"],
                  ["City", addrCity, setAddrCity, "city"],
                  ["Postcode", addrPost, setAddrPost, "postcode"],
                  ["Country", addrCountry, setAddrCountry, "country"],
                ] as const
              ).map(([lab, val, set, id]) => (
                <div key={id}>
                  <label htmlFor={id} className="mb-2 block text-xs font-medium text-[#9CA3AF]">
                    {lab}
                  </label>
                  <FintechInput id={id} value={val} onChange={(e) => set(e.target.value)} />
                </div>
              ))}
            </div>
            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <FintechButton type="button" variant="secondary" className="min-h-12" onClick={() => setEditAddress(false)}>
                Cancel
              </FintechButton>
              <FintechButton type="button" className="min-h-12" onClick={saveAddress} disabled={saving}>
                Save
              </FintechButton>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
