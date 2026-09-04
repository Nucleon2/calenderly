"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
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
import { signUp } from "@/lib/auth-client";
import { signUpSchema } from "@/server/auth/schema";

const signUpFormSchema = signUpSchema
  .extend({ confirmPassword: z.string().min(1, "Please confirm your password") })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

type SignUpFormInput = z.infer<typeof signUpFormSchema>;

type SignUpFormProps = {
  googleEnabled: boolean;
};

export function SignUpForm({ googleEnabled }: SignUpFormProps) {
  const [formError, setFormError] = useState<string | null>(null);
  const router = useRouter();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignUpFormInput>({
    resolver: zodResolver(signUpFormSchema),
    defaultValues: { name: "", email: "", password: "", confirmPassword: "" },
  });

  const onSubmit = async (values: SignUpFormInput) => {
    setFormError(null);
    const { error } = await signUp.email({
      name: values.name,
      email: values.email,
      password: values.password,
      callbackURL: "/onboarding",
    });
    if (error) {
      const message = error.message?.toLowerCase() ?? "";
      setFormError(
        message.includes("already exist") || message.includes("already registered")
          ? "An account with that email already exists."
          : (error.message ?? "Something went wrong. Please try again."),
      );
      return;
    }
    router.push("/onboarding");
    router.refresh();
  };

  return (
    <AuthCard
      title="Create your account"
      description="Set up your scheduling page in a couple of minutes."
      footer={
        <>
          Already have an account?{" "}
          <Link href="/sign-in" className="font-medium text-foreground underline underline-offset-4">
            Sign in
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
          <Field data-invalid={!!errors.name}>
            <FieldLabel htmlFor="name">Name</FieldLabel>
            <Input
              id="name"
              type="text"
              autoComplete="name"
              placeholder="Ada Lovelace"
              aria-invalid={!!errors.name}
              {...register("name")}
            />
            <FieldError errors={[errors.name]} />
          </Field>
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
              autoComplete="new-password"
              minLength={8}
              aria-invalid={!!errors.password}
              {...register("password")}
            />
            <FieldError errors={[errors.password]} />
          </Field>
          <Field data-invalid={!!errors.confirmPassword}>
            <FieldLabel htmlFor="confirmPassword">Confirm password</FieldLabel>
            <Input
              id="confirmPassword"
              type="password"
              autoComplete="new-password"
              minLength={8}
              aria-invalid={!!errors.confirmPassword}
              {...register("confirmPassword")}
            />
            <FieldError errors={[errors.confirmPassword]} />
          </Field>
          {formError && (
            <p role="alert" className="text-sm font-normal text-destructive">
              {formError}
            </p>
          )}
          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? "Creating account…" : "Create account"}
          </Button>
        </FieldGroup>
      </form>
    </AuthCard>
  );
}
