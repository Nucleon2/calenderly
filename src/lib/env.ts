import { z } from "zod";

/**
 * Validated process.env. Import `env` instead of reading process.env directly.
 *
 * Validation is lazy: it runs on the first property access, not at import time. `next build`
 * imports every route module while collecting page data, and hosted builds (Vercel, Docker)
 * generally don't have the runtime configuration available at that point. During the build
 * phase (or with SKIP_ENV_VALIDATION=1) the raw process.env is returned unvalidated; at runtime
 * the first access validates and throws a readable error listing every problem.
 */
const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().url(),
  APP_URL: z.string().url().transform((u) => u.replace(/\/$/, "")),
  BETTER_AUTH_SECRET: z.string().min(16, "BETTER_AUTH_SECRET must be at least 16 characters"),

  SMTP_HOST: z.string().min(1),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_USER: z.string().optional().default(""),
  SMTP_PASS: z.string().optional().default(""),
  SMTP_SECURE: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  EMAIL_FROM: z.string().min(3),

  GOOGLE_CLIENT_ID: z.string().optional().default(""),
  GOOGLE_CLIENT_SECRET: z.string().optional().default(""),

  RUN_MIGRATIONS_ON_BOOT: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
});

export type Env = z.infer<typeof schema>;

function shouldSkipValidation(): boolean {
  return (
    process.env.SKIP_ENV_VALIDATION === "1" ||
    process.env.NEXT_PHASE === "phase-production-build"
  );
}

function load(): Env {
  if (shouldSkipValidation()) {
    return process.env as unknown as Env;
  }
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}\nSee .env.example.`);
  }
  return parsed.data;
}

let cached: Env | undefined;

function get(): Env {
  // Don't cache the unvalidated build-time view; a later runtime access should validate.
  if (shouldSkipValidation()) return load();
  cached ??= load();
  return cached;
}

export const env: Env = new Proxy({} as Env, {
  get(_target, key) {
    return get()[key as keyof Env];
  },
  has(_target, key) {
    return key in get();
  },
  ownKeys() {
    return Reflect.ownKeys(get());
  },
  getOwnPropertyDescriptor(_target, key) {
    const value = get()[key as keyof Env];
    return value === undefined
      ? undefined
      : { value, enumerable: true, configurable: true, writable: false };
  },
});

export const isGoogleConfigured = () =>
  Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
