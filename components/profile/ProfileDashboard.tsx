"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { FintechButton, FintechInput } from "@/components/fintech";
import { compressImageForProfileAvatar } from "@/lib/profileAvatarImageClient";
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

type SavingKey = null | "name" | "phone" | "address" | "avatar";

function SheetChrome({
  children,
  onBackdrop,
  wideScroll,
}: {
  children: React.ReactNode;
  onBackdrop: () => void;
  wideScroll?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4" role="dialog" aria-modal>
      <button
        type="button"
        className="absolute inset-0 cursor-default bg-black/65 backdrop-blur-[2px] transition-opacity"
        aria-label="Close"
        onClick={onBackdrop}
      />
      <div
        className={cnModalShell(wideScroll)}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-2 h-1 w-10 shrink-0 rounded-full bg-white/[0.12] sm:hidden" aria-hidden />
        {children}
      </div>
    </div>
  );
}

function cnModalShell(wideScroll?: boolean) {
  return [
    "relative z-10 w-full max-w-md overflow-hidden rounded-t-[1.25rem] border border-white/[0.08] bg-[#121821] shadow-[0_-8px_40px_rgba(0,0,0,0.5)] sm:rounded-2xl sm:shadow-2xl",
    wideScroll ? "max-h-[min(90vh,720px)] overflow-y-auto" : "",
    "pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3 sm:pt-5",
  ]
    .filter(Boolean)
    .join(" ");
}

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
  const [avatarPick, setAvatarPick] = useState<{ file: File; url: string } | null>(null);

  const [editName, setEditName] = useState(false);
  const [editPhone, setEditPhone] = useState(false);
  const [editAddress, setEditAddress] = useState(false);

  const [nameDraft, setNameDraft] = useState("");
  const [nameError, setNameError] = useState("");
  const [phoneDraft, setPhoneDraft] = useState("");
  const [phoneError, setPhoneError] = useState("");
  const [addr1, setAddr1] = useState("");
  const [addr2, setAddr2] = useState("");
  const [addrCity, setAddrCity] = useState("");
  const [addrPost, setAddrPost] = useState("");
  const [addrCountry, setAddrCountry] = useState("");

  const [savingKey, setSavingKey] = useState<SavingKey>(null);

  useEffect(() => {
    setProfile(initialProfile);
  }, [initialProfile]);

  useEffect(() => {
    return () => {
      if (avatarPick?.url) URL.revokeObjectURL(avatarPick.url);
    };
  }, [avatarPick]);

  const displayName = useMemo(() => {
    const p = profile?.full_name?.trim();
    if (p) return p;
    const c = clerkDisplayName.trim();
    if (c && c !== "Not set") return c;
    return "Account";
  }, [profile, clerkDisplayName]);

  const effectiveAvatarUrl = profile?.avatar_url?.trim() || clerkImageUrl || null;
  const hasCustomAvatar = Boolean(profile?.avatar_url?.trim());
  const hasAnyAvatar = Boolean(effectiveAvatarUrl);

  const hasProfilePhone = Boolean(profile?.phone?.trim());
  const hasClerkPhone = Boolean(clerkPhone);
  const phoneDisplay = useMemo(() => {
    if (hasProfilePhone) return profile!.phone!.trim();
    if (hasClerkPhone) return clerkPhone;
    return "Add phone number";
  }, [profile, hasProfilePhone, hasClerkPhone, clerkPhone]);

  const phoneTone = useMemo(() => {
    if (hasProfilePhone || hasClerkPhone) return "default" as const;
    return "action" as const;
  }, [hasProfilePhone, hasClerkPhone]);

  const hasStructuredAddress = useMemo(() => {
    if (!profile) return false;
    return Boolean(formatProfileAddressLines(profile));
  }, [profile]);

  const addressDisplay = useMemo(() => {
    if (!profile || !hasStructuredAddress) return "Add address";
    return formatProfileAddressLines(profile);
  }, [profile, hasStructuredAddress]);

  const addressTone = hasStructuredAddress ? ("default" as const) : ("action" as const);

  const openName = () => {
    setNameError("");
    setNameDraft(displayName === "Account" ? "" : displayName);
    setEditName(true);
  };

  const openPhone = () => {
    setPhoneError("");
    setPhoneDraft(profile?.phone?.trim() ?? (hasClerkPhone ? clerkPhone : ""));
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

  const submitPatch = useCallback(async (body: Record<string, unknown>) => {
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = (await res.json()) as { error?: string; profile?: UserProfileRecord };
      if (!res.ok) {
        toast.error(j.error ?? "Could not save");
        return { ok: false as const, profile: undefined as UserProfileRecord | undefined };
      }
      if (j.profile) setProfile(j.profile);
      router.refresh();
      return { ok: true as const, profile: j.profile };
    } catch {
      toast.error("Network error");
      return { ok: false as const, profile: undefined };
    }
  }, [router]);

  const saveName = async () => {
    const trimmed = nameDraft.trim();
    if (!trimmed) {
      setNameError("Please enter your name.");
      return;
    }
    setNameError("");
    const previous = profile;
    if (profile) setProfile({ ...profile, full_name: trimmed });
    setEditName(false);
    setSavingKey("name");
    const { ok, profile: next } = await submitPatch({ fullName: trimmed });
    setSavingKey(null);
    if (!ok) {
      setProfile(previous);
      setEditName(true);
      setNameDraft(trimmed);
      return;
    }
    if (next) setProfile(next);
    toast.success("Name updated");
  };

  const savePhone = async () => {
    const raw = phoneDraft.trim();
    if (raw && !/^\+?[\d\s().-]{7,32}$/.test(raw)) {
      setPhoneError("Use a valid number, or leave blank to clear.");
      return;
    }
    setPhoneError("");
    const previous = profile;
    if (profile) setProfile({ ...profile, phone: raw || null });
    setEditPhone(false);
    setSavingKey("phone");
    const { ok, profile: next } = await submitPatch({ phone: phoneDraft });
    setSavingKey(null);
    if (!ok) {
      setProfile(previous);
      setEditPhone(true);
      return;
    }
    if (next) setProfile(next);
    toast.success(raw ? "Phone number updated" : "Phone number cleared");
  };

  const saveAddress = async () => {
    const previous = profile;
    const optimistic: Partial<UserProfileRecord> = {
      address_line_1: addr1.trim() || null,
      address_line_2: addr2.trim() || null,
      city: addrCity.trim() || null,
      postcode: addrPost.trim() || null,
      country: addrCountry.trim() || null,
    };
    if (profile) setProfile({ ...profile, ...optimistic });
    setEditAddress(false);
    setSavingKey("address");
    const { ok, profile: next } = await submitPatch({
      address: {
        line1: addr1,
        line2: addr2,
        city: addrCity,
        postcode: addrPost,
        country: addrCountry,
      },
    });
    setSavingKey(null);
    if (!ok) {
      setProfile(previous);
      setEditAddress(true);
      return;
    }
    if (next) setProfile(next);
    toast.success("Address updated");
  };

  const onPickAvatar = () => {
    setSheetAvatar(false);
    fileRef.current?.click();
  };

  const onAvatarFileChosen = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (avatarPick?.url) URL.revokeObjectURL(avatarPick.url);
    const url = URL.createObjectURL(file);
    setAvatarPick({ file, url });
  };

  const cancelAvatarPick = () => {
    if (avatarPick?.url) URL.revokeObjectURL(avatarPick.url);
    setAvatarPick(null);
  };

  const confirmAvatarUpload = async () => {
    if (!avatarPick) return;
    setSavingKey("avatar");
    try {
      const { blob, filename } = await compressImageForProfileAvatar(avatarPick.file);
      const fd = new FormData();
      fd.set("file", new File([blob], filename, { type: blob.type || "image/jpeg" }));

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
      cancelAvatarPick();
    } catch {
      toast.error("Could not process image");
    } finally {
      setSavingKey(null);
    }
  };

  const removeAvatar = async () => {
    setSheetAvatar(false);
    setSavingKey("avatar");
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
      setSavingKey(null);
    }
  };

  const accountTypeLabel = accountType === "business" ? "Business" : "Personal";
  const avatarBusy = savingKey === "avatar";
  const fieldBusy = (k: SavingKey) => savingKey === k;

  return (
    <div className="mx-auto w-full max-w-lg px-4 pb-[max(3rem,env(safe-area-inset-bottom))] pt-8 sm:px-5 sm:pt-10">
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        onChange={onAvatarFileChosen}
      />

      <header className="flex flex-col items-center px-1 text-center">
        <ProfileAvatar
          name={displayName}
          email={email || "user"}
          imageUrl={effectiveAvatarUrl}
          onPress={() => !avatarBusy && setSheetAvatar(true)}
          busy={avatarBusy}
        />
        <p className="mt-3 max-w-[16rem] text-[11px] font-medium leading-relaxed text-[#5C6570]">
          {hasAnyAvatar ? "Tap to change or remove" : "Tap to add a photo"}
        </p>
        <h1 className="mt-5 text-[1.5rem] font-bold leading-tight tracking-tight text-[#F9FAFB] sm:text-[1.625rem]">
          {displayName}
        </h1>
        {email ? (
          <p className="mt-2 text-sm font-normal leading-relaxed text-[#7C8490]">{email}</p>
        ) : (
          <p className="mt-2 text-sm text-[#93C5FD]">Add email in account settings</p>
        )}
      </header>

      <ProfileSection title="Personal">
        <ProfileRow variant="button" label="Name" value={displayName} onClick={openName} disabled={avatarBusy} />
        <ProfileRow
          variant="link"
          label="Email"
          value={email || "Manage in account settings"}
          href="/app/user"
          valueTone={email ? "default" : "action"}
        />
        <ProfileRow variant="static" label="Account type" value={accountTypeLabel} valueTone="muted" />
      </ProfileSection>

      {accountType === "business" ? (
        <ProfileSection title="Business">
          <ProfileRow variant="static" label="Business name" value={businessName || "—"} valueTone={businessName ? "default" : "muted"} />
          <ProfileRow variant="static" label="Registration ID" value={businessId || "—"} valueTone={businessId ? "default" : "muted"} />
        </ProfileSection>
      ) : null}

      <ProfileSection title="Contact details">
        <ProfileRow
          variant="button"
          label="Phone number"
          value={phoneDisplay}
          valueTone={phoneTone}
          onClick={openPhone}
          disabled={avatarBusy}
        />
        <ProfileRow
          variant="button"
          label="Address"
          value={addressDisplay}
          valueTone={addressTone}
          onClick={openAddress}
          disabled={avatarBusy}
        />
      </ProfileSection>

      <ProfileSection title="Security">
        <ProfileRow
          variant="link"
          label="Password & security"
          value="Password, sessions, and account access"
          href="/app/user"
          valueTone="muted"
        />
      </ProfileSection>

      {/* Avatar action sheet */}
      {sheetAvatar ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4" role="dialog" aria-modal>
          <button type="button" className="absolute inset-0 bg-black/65 backdrop-blur-[2px]" aria-label="Dismiss" onClick={() => !avatarBusy && setSheetAvatar(false)} />
          <div className="relative z-10 w-full max-w-md overflow-hidden rounded-t-[1.25rem] border border-white/[0.08] bg-[#141c28] pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-12px_48px_rgba(0,0,0,0.55)] sm:rounded-2xl sm:shadow-2xl">
            <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-white/[0.12] sm:hidden" />
            <p className="px-5 pb-2 pt-4 text-center text-[10px] font-semibold uppercase tracking-[0.16em] text-[#5C6570]">
              Profile photo
            </p>
            <div className="px-2 pb-2">
              {hasAnyAvatar ? (
                <>
                  <button
                    type="button"
                    className="flex w-full min-h-[3.25rem] items-center rounded-xl px-4 text-left text-[15px] font-medium text-[#F9FAFB] transition-colors hover:bg-white/[0.05] active:bg-white/[0.08] disabled:opacity-40"
                    disabled={avatarBusy}
                    onClick={() => {
                      setSheetAvatar(false);
                      setViewPhoto(true);
                    }}
                  >
                    View photo
                  </button>
                  <button
                    type="button"
                    className="flex w-full min-h-[3.25rem] items-center rounded-xl px-4 text-left text-[15px] font-medium text-[#F9FAFB] transition-colors hover:bg-white/[0.05] active:bg-white/[0.08] disabled:opacity-40"
                    disabled={avatarBusy}
                    onClick={onPickAvatar}
                  >
                    Upload new photo
                  </button>
                  {hasCustomAvatar ? (
                    <button
                      type="button"
                      className="flex w-full min-h-[3.25rem] items-center rounded-xl px-4 text-left text-[15px] font-medium text-[#FCA5A5] transition-colors hover:bg-red-500/10 active:bg-red-500/15 disabled:opacity-40"
                      disabled={avatarBusy}
                      onClick={removeAvatar}
                    >
                      {avatarBusy ? "Removing…" : "Remove photo"}
                    </button>
                  ) : null}
                </>
              ) : (
                <button
                  type="button"
                  className="flex w-full min-h-[3.25rem] items-center rounded-xl px-4 text-left text-[15px] font-medium text-[#F9FAFB] transition-colors hover:bg-white/[0.05] active:bg-white/[0.08] disabled:opacity-40"
                  disabled={avatarBusy}
                  onClick={onPickAvatar}
                >
                  Upload photo
                </button>
              )}
              <button
                type="button"
                className="mt-1 flex w-full min-h-[3.25rem] items-center rounded-xl px-4 text-left text-[15px] font-medium text-[#8B939E] transition-colors hover:bg-white/[0.04] disabled:opacity-40"
                disabled={avatarBusy}
                onClick={() => setSheetAvatar(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {avatarPick ? (
        <SheetChrome onBackdrop={avatarBusy ? () => {} : cancelAvatarPick}>
          <div className="px-5 pt-2 sm:pt-0">
            <h2 className="text-lg font-semibold tracking-tight text-[#F9FAFB]">Use this photo?</h2>
            <p className="mt-1.5 text-sm leading-relaxed text-[#6B7280]">We&apos;ll optimise it for your profile. Max 2MB after upload.</p>
            <div className="mt-5 flex justify-center rounded-2xl border border-white/[0.06] bg-[#0B0F14]/80 p-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={avatarPick.url} alt="" className="max-h-48 max-w-full rounded-xl object-contain shadow-lg" />
            </div>
            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <FintechButton type="button" variant="secondary" className="min-h-12 w-full sm:w-auto" disabled={avatarBusy} onClick={cancelAvatarPick}>
                Cancel
              </FintechButton>
              <FintechButton type="button" className="min-h-12 w-full sm:w-auto" disabled={avatarBusy} onClick={confirmAvatarUpload}>
                {avatarBusy ? "Uploading…" : "Upload"}
              </FintechButton>
            </div>
          </div>
        </SheetChrome>
      ) : null}

      {viewPhoto && effectiveAvatarUrl ? (
        <div className="fixed inset-0 z-[60] flex flex-col bg-[#05070a]/95 backdrop-blur-sm" role="dialog" aria-modal>
          <div className="flex items-center justify-between px-4 pb-2 pt-[max(0.75rem,env(safe-area-inset-top))]">
            <span className="text-sm font-medium text-[#9CA3AF]">Profile photo</span>
            <button
              type="button"
              className="min-h-11 min-w-11 rounded-xl text-sm font-semibold text-[#F9FAFB] transition-colors hover:bg-white/[0.06]"
              onClick={() => setViewPhoto(false)}
            >
              Done
            </button>
          </div>
          <div className="flex flex-1 items-center justify-center px-4 pb-8">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={effectiveAvatarUrl} alt="" className="max-h-[min(78vh,560px)] max-w-full rounded-2xl object-contain shadow-2xl ring-1 ring-white/[0.08]" />
          </div>
        </div>
      ) : null}

      {editName ? (
        <SheetChrome onBackdrop={() => !fieldBusy("name") && setEditName(false)}>
          <div className="px-5 pt-1 sm:pt-0">
            <h2 className="text-lg font-semibold tracking-tight text-[#F9FAFB]">Your name</h2>
            <p className="mt-1.5 text-sm leading-relaxed text-[#6B7280]">Shown across PolyPayd when you send or claim payouts.</p>
            <label htmlFor="profile-name" className="mt-5 mb-2 block text-xs font-medium text-[#9CA3AF]">
              Full name
            </label>
            <FintechInput
              id="profile-name"
              value={nameDraft}
              onChange={(e) => {
                setNameDraft(e.target.value);
                if (nameError) setNameError("");
              }}
              placeholder="e.g. Alex Morgan"
              autoFocus
              aria-invalid={Boolean(nameError)}
            />
            {nameError ? <p className="mt-2 text-sm text-[#FCA5A5]">{nameError}</p> : null}
            <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <FintechButton type="button" variant="secondary" className="min-h-12 w-full sm:w-auto" disabled={fieldBusy("name")} onClick={() => setEditName(false)}>
                Cancel
              </FintechButton>
              <FintechButton type="button" className="min-h-12 w-full sm:w-auto" disabled={fieldBusy("name")} onClick={saveName}>
                {fieldBusy("name") ? "Saving…" : "Save"}
              </FintechButton>
            </div>
          </div>
        </SheetChrome>
      ) : null}

      {editPhone ? (
        <SheetChrome onBackdrop={() => !fieldBusy("phone") && setEditPhone(false)}>
          <div className="px-5 pt-1 sm:pt-0">
            <h2 className="text-lg font-semibold tracking-tight text-[#F9FAFB]">Phone number</h2>
            <p className="mt-1.5 text-sm leading-relaxed text-[#6B7280]">Your contact number on file. Clear the field to remove it from your PolyPayd profile.</p>
            <label htmlFor="profile-phone" className="mt-5 mb-2 block text-xs font-medium text-[#9CA3AF]">
              Phone
            </label>
            <FintechInput
              id="profile-phone"
              type="tel"
              inputMode="tel"
              value={phoneDraft}
              onChange={(e) => {
                setPhoneDraft(e.target.value);
                if (phoneError) setPhoneError("");
              }}
              placeholder="+44 7700 900000"
              autoFocus
              aria-invalid={Boolean(phoneError)}
            />
            {phoneError ? <p className="mt-2 text-sm text-[#FCA5A5]">{phoneError}</p> : null}
            <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <FintechButton type="button" variant="secondary" className="min-h-12 w-full sm:w-auto" disabled={fieldBusy("phone")} onClick={() => setEditPhone(false)}>
                Cancel
              </FintechButton>
              <FintechButton type="button" className="min-h-12 w-full sm:w-auto" disabled={fieldBusy("phone")} onClick={savePhone}>
                {fieldBusy("phone") ? "Saving…" : "Save"}
              </FintechButton>
            </div>
          </div>
        </SheetChrome>
      ) : null}

      {editAddress ? (
        <SheetChrome wideScroll onBackdrop={() => !fieldBusy("address") && setEditAddress(false)}>
          <div className="px-5 pt-1 sm:pt-0">
            <h2 className="text-lg font-semibold tracking-tight text-[#F9FAFB]">Address</h2>
            <p className="mt-1.5 text-sm leading-relaxed text-[#6B7280]">Used for your account records. You can leave optional lines blank.</p>
            <div className="mt-5 space-y-4">
              {(
                [
                  ["Line 1", addr1, setAddr1, "address1", "Street and number"],
                  ["Line 2 (optional)", addr2, setAddr2, "address2", "Flat, building, etc."],
                  ["City / town", addrCity, setAddrCity, "city", ""],
                  ["Postcode", addrPost, setAddrPost, "postcode", ""],
                  ["Country", addrCountry, setAddrCountry, "country", ""],
                ] as const
              ).map(([lab, val, set, id, hint]) => (
                <div key={id}>
                  <label htmlFor={id} className="mb-2 block text-xs font-medium text-[#9CA3AF]">
                    {lab}
                  </label>
                  <FintechInput id={id} value={val} onChange={(e) => set(e.target.value)} placeholder={hint || undefined} />
                </div>
              ))}
            </div>
            <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <FintechButton type="button" variant="secondary" className="min-h-12 w-full sm:w-auto" disabled={fieldBusy("address")} onClick={() => setEditAddress(false)}>
                Cancel
              </FintechButton>
              <FintechButton type="button" className="min-h-12 w-full sm:w-auto" disabled={fieldBusy("address")} onClick={saveAddress}>
                {fieldBusy("address") ? "Saving…" : "Save"}
              </FintechButton>
            </div>
          </div>
        </SheetChrome>
      ) : null}
    </div>
  );
}
