import { NextResponse } from "next/server";
import { getResend } from "@/lib/resend";

export const runtime = "nodejs";

const FOUNDER_TO = "founder@polypayd.co.uk";
const FROM = "PolyPayd <founder@polypayd.co.uk>";
const SUBJECT = "New PolyPayd groups waitlist signup";

const FREQUENCY_LABELS: Record<string, string> = {
  weekly: "Weekly",
  monthly: "Monthly",
  "few-times-year": "A few times a year",
  "one-off": "Just one-off payouts",
  "not-sure": "Not sure yet",
};

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isValidEmail(value: string): boolean {
  const s = value.trim();
  if (s.length > 254) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

function isValidFrequency(value: string): boolean {
  return Object.prototype.hasOwnProperty.call(FREQUENCY_LABELS, value);
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildHtmlBody(fields: {
  fullName: string;
  email: string;
  useCase: string;
  frequencyLabel: string;
}): string {
  const row = (label: string, value: string) => `
    <tr>
      <td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;font-family:system-ui,-apple-system,sans-serif;font-size:14px;color:#6b7280;width:180px;vertical-align:top;">${escapeHtml(label)}</td>
      <td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;font-family:system-ui,-apple-system,sans-serif;font-size:14px;color:#111827;vertical-align:top;">${escapeHtml(value).replace(/\r\n|\r|\n/g, "<br/>")}</td>
    </tr>`;

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width"/></head>
<body style="margin:0;padding:24px;background:#f9fafb;">
  <table role="presentation" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;border-collapse:collapse;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;width:100%;">
    <tr>
      <td colspan="2" style="padding:20px 24px;background:#0f172a;color:#f8fafc;font-family:system-ui,-apple-system,sans-serif;font-size:16px;font-weight:600;">PolyPayd: groups waitlist signup</td>
    </tr>
    ${row("Full name", fields.fullName)}
    ${row("Email", fields.email)}
    ${row("How they'd use it", fields.useCase)}
    ${row("Payout frequency", fields.frequencyLabel)}
  </table>
  <p style="max-width:560px;margin:16px auto 0;font-family:system-ui,-apple-system,sans-serif;font-size:12px;color:#9ca3af;text-align:center;">Submitted via polypayd.co.uk</p>
</body>
</html>`;
}

type ValidationResult =
  | {
      ok: true;
      data: {
        fullName: string;
        email: string;
        useCase: string;
        frequency: string;
        frequencyLabel: string;
      };
    }
  | { ok: false; errors: Record<string, string> };

function validateBody(body: unknown): ValidationResult {
  if (body === null || typeof body !== "object") {
    return { ok: false, errors: { _body: "Request body must be a JSON object." } };
  }

  const o = body as Record<string, unknown>;
  const fullName = o.fullName;
  const email = o.email;
  const useCase = o.useCase;
  const frequency = o.frequency;

  const errors: Record<string, string> = {};

  if (!isNonEmptyString(fullName)) errors.fullName = "Please tell us your name.";
  if (!isNonEmptyString(email)) errors.email = "We need an email to reach you on.";
  else if (!isValidEmail(email)) errors.email = "That email doesn't look right.";
  if (!isNonEmptyString(useCase)) errors.useCase = "A short line on how you'd use it, please.";
  if (!isNonEmptyString(frequency)) errors.frequency = "Pick the one that fits best.";
  else if (!isValidFrequency(frequency.trim())) errors.frequency = "Pick one of the listed options.";

  if (Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }

  if (
    typeof fullName !== "string" ||
    typeof email !== "string" ||
    typeof useCase !== "string" ||
    typeof frequency !== "string"
  ) {
    return { ok: false, errors: { _body: "Invalid payload." } };
  }

  const freqKey = frequency.trim();

  return {
    ok: true,
    data: {
      fullName: fullName.trim(),
      email: email.trim(),
      useCase: useCase.trim(),
      frequency: freqKey,
      frequencyLabel: FREQUENCY_LABELS[freqKey] ?? freqKey,
    },
  };
}

export function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      Allow: "POST, OPTIONS",
    },
  });
}

export async function POST(request: Request) {
  let parsed: unknown;
  try {
    const text = await request.text();
    if (!text.trim()) {
      return NextResponse.json({ error: "Request body is required" }, { status: 400 });
    }
    parsed = JSON.parse(text) as unknown;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const validated = validateBody(parsed);
  if (!validated.ok) {
    return NextResponse.json(
      { error: "Validation failed", fields: validated.errors },
      { status: 400 }
    );
  }

  const { data } = validated;
  const html = buildHtmlBody(data);

  try {
    const resend = getResend();
    const { data: sendData, error } = await resend.emails.send({
      from: FROM,
      to: [FOUNDER_TO],
      replyTo: data.email,
      subject: SUBJECT,
      html,
    });

    if (error) {
      console.error("[waitlist/groups] Resend error:", error);
      return NextResponse.json(
        { error: "Failed to send message. Please try again later." },
        { status: 502 }
      );
    }

    return NextResponse.json({ ok: true, id: sendData?.id ?? null }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("RESEND_API_KEY")) {
      console.error("[waitlist/groups] Resend not configured:", message);
      return NextResponse.json(
        { error: "Email is temporarily unavailable. Please try again later." },
        { status: 503 }
      );
    }
    console.error("[waitlist/groups] Unexpected error:", err);
    return NextResponse.json({ error: "Something went wrong. Please try again later." }, { status: 500 });
  }
}
