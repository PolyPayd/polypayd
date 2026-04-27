"use client";

import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { isValidPhoneNumber, parsePhoneNumberWithError } from "libphonenumber-js";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { AuthCard } from "@/components/auth/auth-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const OnboardingSchema = z.object({
  first_name: z
    .string()
    .trim()
    .min(1, "First name is required")
    .max(100, "Must be 100 characters or fewer"),
  last_name: z
    .string()
    .trim()
    .min(1, "Last name is required")
    .max(100, "Must be 100 characters or fewer"),
  phone_number: z
    .string()
    .trim()
    .min(1, "Phone number is required")
    .refine((v) => isValidPhoneNumber(v, "GB"), {
      message: "Please enter a valid UK phone number",
    }),
});

type OnboardingValues = z.infer<typeof OnboardingSchema>;

export function OnboardingForm() {
  const router = useRouter();
  const [submitError, setSubmitError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting, isValid },
    trigger,
  } = useForm<OnboardingValues>({
    resolver: zodResolver(OnboardingSchema),
    mode: "onTouched",
    defaultValues: { first_name: "", last_name: "", phone_number: "" },
  });

  const onSubmit = async (values: OnboardingValues) => {
    setSubmitError(null);
    try {
      const e164 = parsePhoneNumberWithError(values.phone_number, "GB").number;

      const res = await fetch("/api/app/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          first_name: values.first_name.trim(),
          last_name: values.last_name.trim(),
          phone_number: e164,
        }),
      });

      if (!res.ok) {
        setSubmitError("Something went wrong. Please try again.");
        return;
      }

      router.push("/app");
      router.refresh();
    } catch {
      setSubmitError("Something went wrong. Please try again.");
    }
  };

  return (
    <AuthCard
      heading="Tell us a bit about you"
      subheading="This helps us personalise your account."
      maxWidth="480px"
    >
      <div className="mb-6 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        <span className="inline-flex h-5 items-center rounded-full bg-primary/10 px-2 text-primary">
          Step 1 of 1
        </span>
        <span>Profile</span>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
        {submitError ? (
          <div
            role="alert"
            className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
          >
            {submitError}
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="first_name">First name</Label>
            <Input
              id="first_name"
              type="text"
              autoComplete="given-name"
              placeholder="Olivia"
              aria-invalid={!!errors.first_name || undefined}
              {...register("first_name")}
            />
            {errors.first_name ? (
              <p className="text-xs text-destructive">{errors.first_name.message}</p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="last_name">Last name</Label>
            <Input
              id="last_name"
              type="text"
              autoComplete="family-name"
              placeholder="Smith"
              aria-invalid={!!errors.last_name || undefined}
              {...register("last_name")}
            />
            {errors.last_name ? (
              <p className="text-xs text-destructive">{errors.last_name.message}</p>
            ) : null}
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="phone_number">Phone number</Label>
          <Input
            id="phone_number"
            type="tel"
            autoComplete="tel"
            inputMode="tel"
            placeholder="+44 7700 900000"
            aria-invalid={!!errors.phone_number || undefined}
            {...register("phone_number", {
              onBlur: () => {
                void trigger("phone_number");
              },
            })}
          />
          {errors.phone_number ? (
            <p className="text-xs text-destructive">{errors.phone_number.message}</p>
          ) : (
            <p className="text-xs text-muted-foreground">
              UK numbers only. We&apos;ll use this for security and payout alerts.
            </p>
          )}
        </div>

        <Button
          type="submit"
          className="w-full"
          disabled={!isValid || isSubmitting}
        >
          {isSubmitting ? (
            <>
              <Loader2 className="size-4 animate-spin" /> Saving…
            </>
          ) : (
            "Continue"
          )}
        </Button>
      </form>
    </AuthCard>
  );
}
