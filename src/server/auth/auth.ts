import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { db } from "@/db/client";
import * as schema from "@/db/schema";
import { env, isGoogleConfigured } from "@/lib/env";

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema,
    usePlural: false,
  }),

  baseURL: env.APP_URL,
  secret: env.BETTER_AUTH_SECRET,

  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
  },

  socialProviders: isGoogleConfigured()
    ? {
        google: {
          clientId: env.GOOGLE_CLIENT_ID,
          clientSecret: env.GOOGLE_CLIENT_SECRET,
          accessType: "offline",
          prompt: "select_account consent",
        },
      }
    : undefined,

  user: {
    additionalFields: {
      username: {
        type: "string",
        required: false,
        unique: true,
        // Set server-side during onboarding, not client-writable.
        input: false,
      },
      timezone: {
        type: "string",
        required: false,
        defaultValue: "UTC",
      },
      welcomeText: {
        type: "string",
        required: false,
      },
      weekStart: {
        type: "number",
        required: false,
        defaultValue: 0,
      },
      defaultScheduleId: {
        type: "string",
        required: false,
        input: false,
      },
      onboardingCompletedAt: {
        type: "date",
        required: false,
        input: false,
      },
    },
  },

  account: {
    accountLinking: {
      enabled: true,
      trustedProviders: ["google"],
    },
  },

  // Must be last: it short-circuits set-cookie handling for Next.js server actions/route handlers.
  plugins: [nextCookies()],
});

export type Session = typeof auth.$Infer.Session;
