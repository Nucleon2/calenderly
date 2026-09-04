"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldSeparator,
} from "@/components/ui/field";
import { AuthCard } from "@/components/auth/auth-card";
import { GoogleButton } from "@/components/auth/google-button";
import { signIn } from "@/lib/auth-client";
import { signInSchema, type SignInInput } from "@/server/auth/schema";

type SignInFormProps = {
  googleEnabled: boolean;
  callbackURL: string;
};

export function SignInForm({ googleEnabled, callbackURL }: SignInFormProps) {
  const [formError, setFormError] = useState<string | null>(null);
  const router = useRouter();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignInInput>({
    resolver: zodResolver(signInSchema),
    defaultValues: { email: "", password: "" },
  });

  const onSubmit = async (values: SignInInput) => {
    setFormError(null);
    const { error } = await signIn.email({
      email: values.email,
      password: values.password,
      callbackURL,
    });
    if (error) {
      setFormError(
        error.status === 401 || error.status === 403
          ? "Invalid email or password."
          : (error.message ?? "Something went wrong. Please try again."),
      );
      return;
    }
    router.push(callbackURL);
    router.refresh();
  };

  return (
    <AuthCard
      title="Sign in"
      description="Welcome back. Sign in to manage your schedule."
      footer={
        <>
          Don&apos;t have an account?{" "}
          <Link href="/sign-up" className="font-medium text-foreground underline underline-offset-4">
            Create one
          </Link>
        </>
      }
    >
      {googleEnabled && (
        <>
          <GoogleButton callbackURL="/onboarding" />
          <FieldSeparator>or</FieldSeparator>
        </>
      )}
      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        <FieldGroup>
          <Field data-invalid={!!errors.email}>
            <FieldLabel htmlFor="email">Email</FieldLabel>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              aria-invalid={!!errors.email}
              {...register("email")}
            />
            <FieldError errors={[errors.email]} />
          </Field>
          <Field data-invalid={!!errors.password}>
            <FieldLabel htmlFor="password">Password</FieldLabel>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              minLength={1}
              aria-invalid={!!errors.password}
              {...register("password")}
            />
            <FieldError errors={[errors.password]} />
          </Field>
          {formError && (
            <p role="alert" className="text-sm font-normal text-destructive">
              {formError}
            </p>
          )}
          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? "Signing in…" : "Sign in"}
          </Button>
        </FieldGroup>
      </form>
    </AuthCard>
  );
}
