"use client";

import Link from "next/link";
import { useSignIn } from "@clerk/nextjs";
import { isClerkAPIResponseError } from "@clerk/nextjs/errors";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { AuthCard } from "@/components/auth/auth-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const EmailSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, "Email is required")
    .email("Enter a valid email address"),
});

type EmailValues = z.infer<typeof EmailSchema>;

const RESEND_COOLDOWN_SECONDS = 30;

export default function ForgotPasswordPage() {
  const { isLoaded, signIn } = useSignIn();
  const [stage, setStage] = useState<"enter" | "sent">("enter");
  const [submittedEmail, setSubmittedEmail] = useState<string | null>(null);
  const [topBanner, setTopBanner] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting, isValid },
    trigger,
  } = useForm<EmailValues>({
    resolver: zodResolver(EmailSchema),
    mode: "onTouched",
    defaultValues: { email: "" },
  });

  const sendReset = async (email: string) => {
    if (!isLoaded || !signIn) return;
    await signIn.create({
      strategy: "reset_password_email_code",
      identifier: email,
    });
  };

  const onSubmit = async (values: EmailValues) => {
    setTopBanner(null);
    try {
      await sendReset(values.email);
      setSubmittedEmail(values.email);
      setStage("sent");
      setCooldown(RESEND_COOLDOWN_SECONDS);
    } catch (err) {
      console.error("forgot-password sendReset failed:", err);
      if (isClerkAPIResponseError(err)) {
        const first = err.errors[0];
        if (first?.code === "form_identifier_not_found") {
          // Reveal-resistant: don't tell attackers whether the email exists.
          // Treat as success and show the same confirmation screen.
          setSubmittedEmail(values.email);
          setStage("sent");
          setCooldown(RESEND_COOLDOWN_SECONDS);
          return;
        }
        setTopBanner(first?.longMessage ?? first?.message ?? "Something went wrong.");
        return;
      }
      setTopBanner("Something went wrong. Please try again.");
    }
  };

  const handleResend = async () => {
    if (!submittedEmail || cooldown > 0) return;
    try {
      await sendReset(submittedEmail);
      setCooldown(RESEND_COOLDOWN_SECONDS);
    } catch (err) {
      console.error("forgot-password resend failed:", err);
    }
  };

  if (stage === "sent" && submittedEmail) {
    return (
      <main className="flex min-h-screen w-full flex-col items-center justify-center bg-slate-50 px-4 py-10">
        <AuthCard
          heading="Check your email"
          subheading={`We've sent a reset link to ${submittedEmail}. It expires in 10 minutes.`}
          footer={
            <Link
              href="/signin"
              className="font-medium text-teal-600 hover:underline"
            >
              Back to sign in
            </Link>
          }
        >
          <div className="space-y-3 text-sm text-slate-600">
            <p>
              Didn&apos;t get the email? Check your spam folder, or resend it
              below.
            </p>
            <button
              type="button"
              onClick={handleResend}
              disabled={cooldown > 0}
              className={`text-sm font-medium ${
                cooldown > 0
                  ? "cursor-not-allowed text-slate-400"
                  : "text-teal-600 hover:underline"
              }`}
            >
              {cooldown > 0 ? `Resend email (${cooldown}s)` : "Resend email"}
            </button>
          </div>
        </AuthCard>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen w-full flex-col items-center justify-center bg-slate-50 px-4 py-10">
      <AuthCard
        heading="Reset your password"
        subheading="Enter your email and we'll send you a reset link."
        footer={
          <Link href="/signin" className="font-medium text-teal-600 hover:underline">
            Back to sign in
          </Link>
        }
      >
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
          {topBanner ? (
            <div
              role="alert"
              className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700"
            >
              {topBanner}
            </div>
          ) : null}

          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              aria-invalid={!!errors.email || undefined}
              {...register("email", {
                onBlur: () => {
                  void trigger("email");
                },
              })}
            />
            {errors.email ? (
              <p className="text-xs text-red-600">{errors.email.message}</p>
            ) : null}
          </div>

          <Button
            type="submit"
            className="w-full"
            disabled={!isLoaded || !isValid || isSubmitting}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="size-4 animate-spin" /> Sending…
              </>
            ) : (
              "Send reset link"
            )}
          </Button>
        </form>
      </AuthCard>
    </main>
  );
}
