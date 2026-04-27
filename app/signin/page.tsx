"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth, useSignIn } from "@clerk/nextjs";
import { isClerkAPIResponseError } from "@clerk/nextjs/errors";
import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { AuthCard } from "@/components/auth/auth-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const SigninSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, "Email is required")
    .email("Enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});

type SigninValues = z.infer<typeof SigninSchema>;

type EmailCodeFactor = {
  strategy: "email_code";
  emailAddressId: string;
  safeIdentifier?: string;
};

function pickEmailCodeFactor(
  factors: ReadonlyArray<{ strategy: string }> | undefined
): EmailCodeFactor | null {
  if (!factors) return null;
  for (const f of factors) {
    if (f.strategy === "email_code") return f as EmailCodeFactor;
  }
  return null;
}

export default function SigninPage() {
  const router = useRouter();
  const { isLoaded, signIn, setActive } = useSignIn();
  const { isLoaded: authLoaded, isSignedIn } = useAuth();
  const [showPassword, setShowPassword] = useState(false);
  const [topBanner, setTopBanner] = useState<string | null>(null);

  // Inline email-code step. Reused for two cases:
  //   kind === "first"  -> Clerk returned `needs_first_factor` (email not verified yet).
  //                        We complete via signIn.attemptFirstFactor.
  //   kind === "second" -> Clerk returned `needs_second_factor` with email_code as the
  //                        chosen 2FA method. We complete via signIn.attemptSecondFactor.
  const [verifyStage, setVerifyStage] = useState<{
    email: string;
    safeIdentifier?: string;
    kind: "first" | "second";
  } | null>(null);
  const [verifyCode, setVerifyCode] = useState("");
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);

  useEffect(() => {
    if (authLoaded && isSignedIn) router.replace("/app");
  }, [authLoaded, isSignedIn, router]);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting, isValid },
    trigger,
  } = useForm<SigninValues>({
    resolver: zodResolver(SigninSchema),
    mode: "onTouched",
    defaultValues: { email: "", password: "" },
  });

  const sendEmailCode = async (
    factor: EmailCodeFactor,
    email: string
  ): Promise<boolean> => {
    if (!isLoaded || !signIn) return false;
    try {
      await signIn.prepareFirstFactor({
        strategy: "email_code",
        emailAddressId: factor.emailAddressId,
      });
      setVerifyStage({
        email,
        safeIdentifier: factor.safeIdentifier,
        kind: "first",
      });
      return true;
    } catch (err) {
      console.error("signIn.prepareFirstFactor failed:", err);
      const message =
        isClerkAPIResponseError(err) && err.errors[0]?.longMessage
          ? err.errors[0].longMessage
          : "We couldn't send the code. Please try again.";
      setTopBanner(message);
      return false;
    }
  };

  // Second-factor email_code path. Clerk's TS types don't include `email_code`
  // in PrepareSecondFactorParams (their built-ins are totp / phone_code / backup_code),
  // so we cast through the param type. Behaviour is supported at runtime when the
  // instance has email-code 2FA enabled.
  const sendSecondFactorEmailCode = async (
    email: string,
    safeIdentifier?: string
  ): Promise<boolean> => {
    if (!isLoaded || !signIn) return false;
    try {
      await signIn.prepareSecondFactor({
        strategy: "email_code",
      } as Parameters<typeof signIn.prepareSecondFactor>[0]);
      setVerifyStage({ email, safeIdentifier, kind: "second" });
      return true;
    } catch (err) {
      console.error("signIn.prepareSecondFactor failed:", err);
      const message =
        isClerkAPIResponseError(err) && err.errors[0]?.longMessage
          ? err.errors[0].longMessage
          : "We couldn't send the verification code. Please try again.";
      setTopBanner(message);
      return false;
    }
  };

  const onSubmit = async (values: SigninValues) => {
    if (!isLoaded) return;
    setTopBanner(null);
    try {
      const result = await signIn.create({
        identifier: values.email,
        password: values.password,
      });

      if (result.status === "complete") {
        await setActive({ session: result.createdSessionId });
        router.push("/app");
        return;
      }

      if (result.status === "needs_first_factor") {
        const factor = pickEmailCodeFactor(result.supportedFirstFactors ?? undefined);
        if (factor) {
          await sendEmailCode(factor, values.email);
          return;
        }
        setTopBanner(
          "We couldn't sign you in with a password. Please use a different method."
        );
        return;
      }

      if (result.status === "needs_second_factor") {
        const factors = result.supportedSecondFactors ?? [];
        const emailFactor = factors.find((f) => f.strategy === "email_code") as
          | { strategy: "email_code"; safeIdentifier?: string }
          | undefined;
        if (emailFactor) {
          await sendSecondFactorEmailCode(values.email, emailFactor.safeIdentifier);
          return;
        }
        console.warn(
          "signIn.create returned needs_second_factor with no email_code factor. Supported:",
          factors
        );
        setTopBanner(
          "Two-factor authentication is required, but no supported method was returned for this account."
        );
        return;
      }

      if (result.status === "needs_new_password") {
        setTopBanner(
          "You need to set a new password. Use the 'Forgot password?' link to reset it."
        );
        return;
      }

      console.warn("signIn.create returned unexpected status:", result.status);
      setTopBanner(`Sign-in incomplete (status: ${result.status}). Please try again.`);
    } catch (err: unknown) {
      console.error("signIn.create failed:", err);

      if (isClerkAPIResponseError(err)) {
        const first = err.errors[0];
        const code = first?.code;

        if (code === "session_exists") {
          router.replace("/app");
          return;
        }
        if (
          code === "form_password_incorrect" ||
          code === "form_param_format_invalid"
        ) {
          setTopBanner("Incorrect email or password.");
          return;
        }
        if (
          code === "form_identifier_not_found" ||
          code === "form_user_not_found"
        ) {
          setTopBanner("No account found with this email.");
          return;
        }
        if (code === "strategy_for_user_invalid") {
          setTopBanner(
            "This account doesn't use a password. Try signing in with the method you originally used."
          );
          return;
        }

        setTopBanner(
          first?.longMessage ??
            first?.message ??
            "Something went wrong. Please try again."
        );
        return;
      }
      setTopBanner("Something went wrong. Please try again.");
    }
  };

  const handleVerify = async () => {
    if (!isLoaded || !signIn || !verifyStage) return;
    setVerifyError(null);
    setVerifying(true);
    try {
      const code = verifyCode.trim();
      const attempt =
        verifyStage.kind === "second"
          ? await signIn.attemptSecondFactor({
              strategy: "email_code",
              code,
            } as Parameters<typeof signIn.attemptSecondFactor>[0])
          : await signIn.attemptFirstFactor({
              strategy: "email_code",
              code,
            });
      if (attempt.status === "complete") {
        await setActive({ session: attempt.createdSessionId });
        router.push("/app");
        return;
      }
      setVerifyError(`Verification incomplete (status: ${attempt.status}).`);
    } catch (err) {
      console.error(
        verifyStage.kind === "second"
          ? "signIn.attemptSecondFactor failed:"
          : "signIn.attemptFirstFactor failed:",
        err
      );
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
    const isSecond = verifyStage.kind === "second";
    return (
      <main className="flex min-h-screen w-full flex-col items-center justify-center bg-slate-50 px-4 py-10">
        <AuthCard
          heading={isSecond ? "Two-step verification" : "Verify your email"}
          subheading={
            isSecond
              ? `Enter the 6-digit code we sent to ${verifyStage.safeIdentifier ?? verifyStage.email} to finish signing in.`
              : `Enter the 6-digit code we sent to ${verifyStage.email}.`
          }
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
              Use a different account
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
        heading="Welcome back"
        subheading="Sign in to your PolyPayd account"
        footer={
          <span>
            Don&apos;t have an account?{" "}
            <Link href="/signup" className="font-medium text-teal-600 hover:underline">
              Create one
            </Link>
          </span>
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

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="password">Password</Label>
              <Link
                href="/forgot-password"
                className="text-xs font-medium text-teal-600 hover:underline"
              >
                Forgot password?
              </Link>
            </div>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                aria-invalid={!!errors.password || undefined}
                className="pr-10"
                {...register("password")}
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
            {errors.password ? (
              <p className="text-xs text-red-600">{errors.password.message}</p>
            ) : null}
          </div>

          <Button
            type="submit"
            className="w-full"
            disabled={!isLoaded || !isValid || isSubmitting}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="size-4 animate-spin" /> Signing in…
              </>
            ) : (
              "Sign in"
            )}
          </Button>
        </form>
      </AuthCard>
    </main>
  );
}
