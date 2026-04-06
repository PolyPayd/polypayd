const PHONE_RE = /^\+?[\d\s().-]{7,32}$/;

export function formatProfileAddressLines(p: {
  address_line_1: string | null;
  address_line_2: string | null;
  city: string | null;
  postcode: string | null;
  country: string | null;
}): string {
  return [p.address_line_1, p.address_line_2, p.city, p.postcode, p.country]
    .map((s) => (s ?? "").trim())
    .filter(Boolean)
    .join(", ");
}

export function validateFullName(raw: string): { ok: true; value: string } | { ok: false; error: string } {
  const value = raw.trim().replace(/\s+/g, " ");
  if (!value) return { ok: false, error: "Name is required." };
  if (value.length > 120) return { ok: false, error: "Name is too long." };
  return { ok: true, value };
}

export function validatePhone(raw: string): { ok: true; value: string } | { ok: false; error: string } {
  const value = raw.trim();
  if (!value) return { ok: true, value: "" };
  if (!PHONE_RE.test(value)) return { ok: false, error: "Enter a valid phone number or leave blank." };
  return { ok: true, value };
}

export function validateAddressPart(raw: string, label: string, max = 200): { ok: true; value: string } | { ok: false; error: string } {
  const value = raw.trim();
  if (value.length > max) return { ok: false, error: `${label} is too long.` };
  return { ok: true, value };
}

export function splitFullNameForClerk(full: string): { firstName: string; lastName: string } {
  const t = full.trim().replace(/\s+/g, " ");
  if (!t) return { firstName: "", lastName: "" };
  const i = t.indexOf(" ");
  if (i === -1) return { firstName: t, lastName: "" };
  return { firstName: t.slice(0, i), lastName: t.slice(i + 1) };
}

const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
const AVATAR_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

export function validateAvatarFile(file: File): { ok: true } | { ok: false; error: string } {
  if (!AVATAR_TYPES.has(file.type)) {
    return { ok: false, error: "Use a JPEG, PNG, WebP, or GIF image." };
  }
  if (file.size > AVATAR_MAX_BYTES) {
    return { ok: false, error: "Image must be 2MB or smaller." };
  }
  return { ok: true };
}

export function extractAvatarStoragePathFromPublicUrl(url: string): string | null {
  const marker = "/object/public/profile-avatars/";
  const i = url.indexOf(marker);
  if (i === -1) return null;
  return decodeURIComponent(url.slice(i + marker.length));
}
