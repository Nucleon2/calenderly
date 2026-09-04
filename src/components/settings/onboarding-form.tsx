"use client";

import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { UsernameField } from "@/components/settings/username-field";
import { TimezoneSelect } from "@/components/settings/timezone-select";
import { detectBrowserTimezone } from "@/lib/timezones";
import { onboardingSchema, type OnboardingInput } from "@/server/users/schema";
import { completeOnboardingAction } from "@/app/(auth)/onboarding/actions";

interface OnboardingFormProps {
  defaultName: string;
  defaultUsername: string;
  defaultTimezone: string;
  urlPrefix: string;
}

export function OnboardingForm({
  defaultName,
  defaultUsername,
  defaultTimezone,
  urlPrefix,
}: OnboardingFormProps) {
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    control,
    setValue,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<OnboardingInput>({
    resolver: zodResolver(onboardingSchema),
    defaultValues: {
      name: defaultName,
      username: defaultUsername,
      timezone: defaultTimezone,
      welcomeText: "",
    },
  });

  useEffect(() => {
    // The server only knows the account's stored (default "UTC") timezone.
    // Prefer whatever the browser reports, once, on first render.
    if (defaultTimezone === "UTC") {
      const detected = detectBrowserTimezone();
      if (detected && detected !== "UTC") {
        setValue("timezone", detected, { shouldValidate: true });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onSubmit = async (values: OnboardingInput) => {
    setFormError(null);
    const result = await completeOnboardingAction(values);
    if (!result.ok) {
      if (result.field === "username") {
        setError("username", { message: result.error });
      } else if (result.field && result.field in values) {
        setError(result.field as keyof OnboardingInput, { message: result.error });
      } else {
        setFormError(result.error);
      }
    }
    // On success, completeOnboardingAction redirects — nothing left to do.
  };

  return (
    <Card className="w-full max-w-lg">
      <CardHeader>
        <CardTitle className="text-xl">Set up your account</CardTitle>
        <CardDescription>
          Tell us a bit about yourself so people know who they&apos;re booking with.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <FieldGroup>
            <FieldSet>
              <FieldLegend variant="label">Your details</FieldLegend>
              <Field data-invalid={!!errors.name}>
                <FieldLabel htmlFor="name">Full name</FieldLabel>
                <Input id="name" aria-invalid={!!errors.name} {...register("name")} />
                <FieldError errors={[errors.name]} />
              </Field>
              <Field data-invalid={!!errors.username}>
                <FieldLabel htmlFor="username">Username</FieldLabel>
                <Controller
                  control={control}
                  name="username"
                  render={({ field }) => (
                    <UsernameField
                      id="username"
                      value={field.value}
                      onChange={field.onChange}
                      onBlur={field.onBlur}
                      urlPrefix={urlPrefix}
                      aria-invalid={!!errors.username}
                    />
                  )}
                />
                <FieldError errors={[errors.username]} />
              </Field>
            </FieldSet>

            <FieldSet>
              <FieldLegend variant="label">Time zone</FieldLegend>
              <Field data-invalid={!!errors.timezone}>
                <FieldLabel htmlFor="timezone">Your time zone</FieldLabel>
                <Controller
                  control={control}
                  name="timezone"
                  render={({ field }) => (
                    <TimezoneSelect
                      id="timezone"
                      value={field.value}
                      onValueChange={field.onChange}
                      aria-invalid={!!errors.timezone}
                    />
                  )}
                />
                <FieldDescription>Used to show your availability at the right times.</FieldDescription>
                <FieldError errors={[errors.timezone]} />
              </Field>
            </FieldSet>

            <FieldSet>
              <FieldLegend variant="label">Welcome message</FieldLegend>
              <Field data-invalid={!!errors.welcomeText}>
                <FieldLabel htmlFor="welcomeText">Shown on your booking page (optional)</FieldLabel>
                <Textarea
                  id="welcomeText"
                  rows={3}
                  placeholder="Hi, thanks for stopping by! Book a time that works for you."
                  aria-invalid={!!errors.welcomeText}
                  {...register("welcomeText")}
                />
                <FieldError errors={[errors.welcomeText]} />
              </Field>
            </FieldSet>

            {formError && (
              <p role="alert" className="text-sm font-normal text-destructive">
                {formError}
              </p>
            )}

            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? "Finishing setup…" : "Finish setup"}
            </Button>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  );
}
