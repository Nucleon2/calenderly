"use client";

import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { CheckIcon, CopyIcon } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { profileSchema, type ProfileInput } from "@/server/users/schema";
import { updateProfileAction } from "@/app/dashboard/settings/profile/actions";

interface ProfileFormProps {
  defaultName: string;
  defaultUsername: string;
  defaultTimezone: string;
  defaultWelcomeText: string;
  defaultWeekStart: 0 | 1 | 6;
  defaultImage: string;
  urlPrefix: string;
  publicUrl: string;
}

const WEEK_START_OPTIONS: { value: "0" | "1" | "6"; label: string }[] = [
  { value: "0", label: "Sunday" },
  { value: "1", label: "Monday" },
  { value: "6", label: "Saturday" },
];

export function ProfileForm({
  defaultName,
  defaultUsername,
  defaultTimezone,
  defaultWelcomeText,
  defaultWeekStart,
  defaultImage,
  urlPrefix,
  publicUrl,
}: ProfileFormProps) {
  const [formError, setFormError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const {
    register,
    handleSubmit,
    control,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ProfileInput>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      name: defaultName,
      username: defaultUsername,
      timezone: defaultTimezone,
      welcomeText: defaultWelcomeText,
      weekStart: defaultWeekStart,
      image: defaultImage,
    },
  });

  const onSubmit = async (values: ProfileInput) => {
    setFormError(null);
    const result = await updateProfileAction(values);
    if (!result.ok) {
      if (result.field && result.field in values) {
        setError(result.field as keyof ProfileInput, { message: result.error });
      } else {
        setFormError(result.error);
      }
      return;
    }
    toast.success("Profile updated");
  };

  const copyPublicUrl = async () => {
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Couldn't copy the link");
    }
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="text-lg">Your public page</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2">
          <span className="flex-1 truncate text-sm text-foreground">{publicUrl}</span>
          <Button type="button" variant="outline" size="sm" onClick={copyPublicUrl}>
            {copied ? (
              <>
                <CheckIcon /> Copied
              </>
            ) : (
              <>
                <CopyIcon /> Copy
              </>
            )}
          </Button>
        </div>

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
                      initialUsername={defaultUsername}
                      aria-invalid={!!errors.username}
                    />
                  )}
                />
                <FieldError errors={[errors.username]} />
              </Field>
              <Field data-invalid={!!errors.image}>
                <FieldLabel htmlFor="image">Avatar URL</FieldLabel>
                <Input
                  id="image"
                  type="url"
                  placeholder="https://…"
                  aria-invalid={!!errors.image}
                  {...register("image")}
                />
                <FieldError errors={[errors.image]} />
              </Field>
            </FieldSet>

            <FieldSet>
              <FieldLegend variant="label">Time zone &amp; week</FieldLegend>
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
                <FieldError errors={[errors.timezone]} />
              </Field>
              <Field data-invalid={!!errors.weekStart}>
                <FieldLabel htmlFor="weekStart">Week starts on</FieldLabel>
                <Controller
                  control={control}
                  name="weekStart"
                  render={({ field }) => (
                    <Select
                      items={WEEK_START_OPTIONS}
                      value={String(field.value) as "0" | "1" | "6"}
                      onValueChange={(next) => field.onChange(Number(next) as 0 | 1 | 6)}
                    >
                      <SelectTrigger id="weekStart" className="w-full" aria-invalid={!!errors.weekStart}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {WEEK_START_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                <FieldError errors={[errors.weekStart]} />
              </Field>
            </FieldSet>

            <FieldSet>
              <FieldLegend variant="label">Welcome message</FieldLegend>
              <Field data-invalid={!!errors.welcomeText}>
                <FieldLabel htmlFor="welcomeText">Shown on your booking page (optional)</FieldLabel>
                <Textarea
                  id="welcomeText"
                  rows={3}
                  aria-invalid={!!errors.welcomeText}
                  {...register("welcomeText")}
                />
                <FieldDescription>Up to 500 characters.</FieldDescription>
                <FieldError errors={[errors.welcomeText]} />
              </Field>
            </FieldSet>

            {formError && (
              <p role="alert" className="text-sm font-normal text-destructive">
                {formError}
              </p>
            )}

            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Saving…" : "Save changes"}
            </Button>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  );
}
