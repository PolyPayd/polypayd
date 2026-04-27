"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth, useSignUp } from "@clerk/nextjs";
import { isClerkAPIResponseError } from "@clerk/nextjs/errors";
import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { AuthCard } from "@/components/auth/auth-card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const SignupSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, "Email is required")
    .email("Enter a valid email address"),
  password: z
    .string()
    .min(10, "Password must be at least 10 characters")
    .refine((v) => /\d/.test(v), {
      message: "Password must include at least one number",
    }),
  terms: z
    .boolean()
    .refine((v) => v === true, { message: "You must accept the terms" }),
});

type SignupValues = z.infer<typeof SignupSchema>;

function passwordStrength(password: string): 0 | 1 | 2 | 3 | 4 {
  let score = 0;
  if (password.length >= 10) score++;
  if (/\d/.test(password)) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;
  return Math.min(score, 4) as 0 | 1 | 2 | 3 | 4;
}

const STRENGTH_META: Record<
  number,
  { label: string; barClass: string; textClass: string }
> = {
  0: { label: "Too short", barClass: "bg-slate-200", textClass: "text-slate-500" },
  1: { label: "Weak", barClass: "bg-red-500", textClass: "text-red-600" },
  2: { label: "Fair", barClass: "bg-amber-500", textClass: "text-amber-600" },
  3: { label: "Good", barClass: "bg-blue-500", textClass: "text-blue-600" },
  4: { label: "Strong", barClass: "bg-emerald-500", textClass: "text-emerald-600" },
};

export default function SignupPage() {
  const router = useRouter();
  const { isLoaded, signUp, setActive } = useSignUp();
  const { isLoaded: authLoaded, isSignedIn } = useAuth();
  const [showPassword, setShowPassword] = useState(false);
  const [topBanner, setTopBanner] = useState<{
    tone: "error" | "info";
    text: string;
  } | null>(null);

  // Email-verification step (Clerk requires this for password sign-ups when
  // the instance has email verification enabled).
  const [verifyStage, setVerifyStage] = useState<{ email: string } | null>(null);
  const [verifyCode, setVerifyCode] = useState("");
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);

  useEffect(() => {
    if (authLoaded && isSignedIn) router.replace("/app/onboarding");
  }, [authLoaded, isSignedIn, router]);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting, isValid },
    trigger,
  } = useForm<SignupValues>({
    resolver: zodResolver(SignupSchema),
    mode: "onTouched",
    defaultValues: { email: "", password: "", terms: false },
  });

  const password = watch("password") ?? "";
  const terms = watch("terms") ?? false;
  const strength = useMemo(() => passwordStrength(password), [password]);
  const meta = STRENGTH_META[strength];

  const onSubmit = async (values: SignupValues) => {
    if (!isLoaded) return;
    setTopBanner(null);
    try {
      await signUp.create({
        emailAddress: values.email,
        password: values.password,
      });

      await signUp.prepareEmailAddressVerification({ strategy: "email_code" });
      setVerifyStage({ email: values.email });
    } catch (err: unknown) {
      console.error("signUp.create failed:", err);
      if (isClerkAPIResponseError(err)) {
        const first = err.errors[0];
        const code = first?.code;
        if (code === "form_identifier_exists") {
          setTopBanner({
            tone: "error",
            text: "An account with this email already exists. Sign in instead.",
          });
          return;
        }
        if (code === "form_password_pwned") {
          setTopBanner({
            tone: "error",
            text: "This password has appeared in a data breach. Choose a different one.",
          });
          return;
        }
        if (code === "session_exists") {
          router.replace("/app/onboarding");
          return;
        }
        setTopBanner({
          tone: "error",
          text:
            first?.longMessage ??
            first?.message ??
            "Something went wrong. Please try again.",
        });
        return;
      }
      setTopBanner({ tone: "error", text: "Something went wrong. Please try again." });
    }
  };

  const handleVerify = async () => {
    if (!isLoaded || !signUp || !verifyStage) return;
    setVerifyError(null);
    setVerifying(true);
    try {
      const attempt = await signUp.attemptEmailAddressVerification({
        code: verifyCode.trim(),
      });
      if (attempt.status === "complete") {
        await setActive({ session: attempt.createdSessionId });
        router.push("/app/onboarding");
        return;
      }
      setVerifyError(`Verification incomplete (status: ${attempt.status}).`);
    } catch (err) {
      console.error("signUp.attemptEmailAddressVerification failed:", err);
      if (isClerkAPIResponseError(err)) {
        setVerifyError(
          err.errors[0]?.longMessage ??
            err.errors[0]?.message ??
            "That code didn't work. Try again."
        );
      } else {
        setVerifyError("Something went wrong. Please try again.");
      }
    } finally {
      setVerifying(false);
    }
  };

  if (verifyStage) {
    return (
      <main className="flex min-h-screen w-full flex-col items-center justify-center bg-slate-50 px-4 py-10">
        <AuthCard
          heading="Verify your email"
          subheading={`We sent a 6-digit code to ${verifyStage.email}.`}
          footer={
            <button
              type="button"
              className="font-medium text-teal-600 hover:underline"
              onClick={() => {
                setVerifyStage(null);
                setVerifyCode("");
                setVerifyError(null);
              }}
            >
              Use a different email
            </button>
          }
        >
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="code">Verification code</Label>
              <Input
                id="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="123456"
                value={verifyCode}
                onChange={(e) => setVerifyCode(e.target.value)}
                maxLength={8}
              />
              {verifyError ? (
                <p className="text-xs text-red-600">{verifyError}</p>
              ) : null}
            </div>
            <Button
              type="button"
              className="w-full"
              disabled={verifying || verifyCode.trim().length < 4}
              onClick={handleVerify}
            >
              {verifying ? (
                <>
                  <Loader2 className="size-4 animate-spin" /> Verifying…
                </>
              ) : (
                "Verify and continue"
              )}
            </Button>
          </div>
        </AuthCard>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen w-full flex-col items-center justify-center bg-slate-50 px-4 py-10">
      <AuthCard
        heading="Create your account"
        subheading="Send money to your whole group in one go."
        footer={
          <span>
            Already have an account?{" "}
            <Link href="/signin" className="font-medium text-teal-600 hover:underline">
              Sign in
            </Link>
          </span>
        }
      >
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
          {topBanner ? (
            <div
              role="alert"
              className={
                topBanner.tone === "error"
                  ? "rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700"
                  : "rounded-md border border-blue-300 bg-blue-50 p-3 text-sm text-blue-700"
              }
            >
              {topBanner.text}
              {topBanner.tone === "error" &&
              topBanner.text.includes("already exists") ? (
                <>
                  {" "}
                  <Link href="/signin" className="font-medium underline">
                    Sign in
                  </Link>
                </>
              ) : null}
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

          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                aria-invalid={!!errors.password || undefined}
                className="pr-10"
                {...register("password", {
                  onBlur: () => {
                    void trigger("password");
                  },
                })}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-500 hover:text-slate-900"
                aria-label={showPassword ? "Hide password" : "Show password"}
                tabIndex={-1}
              >
                {showPassword ? (
                  <EyeOff className="size-4" />
                ) : (
                  <Eye className="size-4" />
                )}
              </button>
            </div>

            <div className="mt-2 flex gap-1.5">
              {[0, 1, 2, 3].map((i) => (
                <span
                  key={i}
                  className={`h-1 flex-1 rounded-full ${i < strength ? meta.barClass : "bg-slate-200"}`}
                />
              ))}
            </div>
            {errors.password ? (
              <p className="text-xs text-red-600">{errors.password.message}</p>
            ) : (
              <p className={`text-xs ${meta.textClass}`}>
                {password ? meta.label : "At least 10 characters and 1 number."}
              </p>
            )}
          </div>

          <div className="flex items-start gap-3">
            <Checkbox
              id="terms"
              checked={terms}
              onCheckedChange={(v) => {
                setValue("terms", v === true, {
                  shouldValidate: true,
                  shouldDirty: true,
                });
              }}
              className="mt-0.5"
            />
            <Label htmlFor="terms" className="text-sm font-normal leading-snug">
              I agree to the{" "}
              <Link href="/terms" className="font-medium text-teal-600 hover:underline">
                Terms of Service
              </Link>{" "}
              and{" "}
              <Link href="/privacy" className="font-medium text-teal-600 hover:underline">
                Privacy Notice
              </Link>
              .
            </Label>
          </div>
          {errors.terms ? (
            <p className="-mt-3 text-xs text-red-600">{errors.terms.message}</p>
          ) : null}

          <Button
            type="submit"
            className="w-full"
            disabled={!isLoaded || !isValid || isSubmitting}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="size-4 animate-spin" /> Creating account…
              </>
            ) : (
              "Create account"
            )}
          </Button>
        </form>
      </AuthCard>
    </main>
  );
}
