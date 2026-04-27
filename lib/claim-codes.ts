// Claim code generation utilities.
//
// Alphabet: A-Z minus I, L, O; digits 2-9 minus 5.
// That gives 23 letters + 6 digits = 29 unambiguous characters.
//
// Collision checking is NOT done here — the caller (batch creation) retries
// on a unique constraint violation from the database.

export const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ234678";

export function generateClaimCode(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);

  let code = "";
  for (const byte of bytes) {
    // Rejection-sample to eliminate modulo bias.
    // 256 / 29 = 8 full groups (232), so bytes >= 232 are rejected.
    const limit = 256 - (256 % ALPHABET.length);
    let b = byte;
    if (b >= limit) {
      const extra = new Uint8Array(1);
      let attempts = 0;
      do {
        crypto.getRandomValues(extra);
        b = extra[0];
        attempts++;
        if (attempts > 100) break;
      } while (b >= limit);
    }
    code += ALPHABET[b % ALPHABET.length];
  }

  return code;
}

export function formatClaimCode(raw: string): string {
  return `${raw.slice(0, 4)}-${raw.slice(4, 8)}`;
}

export function normaliseClaimCode(input: string): string {
  return input.replace(/[\s-]/g, "").toUpperCase();
}
