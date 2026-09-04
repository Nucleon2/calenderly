import { z } from "zod";
import { isValidTimeZone } from "@/lib/time";
import { isReservedUsername } from "@/lib/reserved-usernames";

const USERNAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, "Username must be at least 3 characters")
  .max(30, "Username must be at most 30 characters")
  .regex(
    USERNAME_RE,
    "Username can only contain lowercase letters, digits and hyphens, and can't start or end with a hyphen",
  )
  .refine((username) => !isReservedUsername(username), {
    message: "This username is reserved",
  });

export type Username = z.infer<typeof usernameSchema>;

const timezoneSchema = z.string().refine(isValidTimeZone, {
  message: "Enter a valid time zone",
});

const nameSchema = z
  .string()
  .trim()
  .min(2, "Name must be at least 2 characters")
  .max(80, "Name must be at most 80 characters");

const welcomeTextSchema = z.string().trim().max(500, "Welcome text must be at most 500 characters");

export const onboardingSchema = z.object({
  username: usernameSchema,
  timezone: timezoneSchema,
  name: nameSchema,
  welcomeText: welcomeTextSchema.optional().or(z.literal("")),
});

export type OnboardingInput = z.infer<typeof onboardingSchema>;

export const weekStartSchema = z.union([z.literal(0), z.literal(1), z.literal(6)]);

export const profileSchema = z.object({
  name: nameSchema,
  username: usernameSchema,
  timezone: timezoneSchema,
  welcomeText: welcomeTextSchema.optional().or(z.literal("")),
  weekStart: weekStartSchema,
  image: z.union([z.url("Enter a valid URL"), z.literal("")]).optional(),
});

export type ProfileInput = z.infer<typeof profileSchema>;
