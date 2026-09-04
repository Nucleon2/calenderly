// Test-only env so `@/lib/env` validates without a real .env.
(process.env as Record<string, string>).NODE_ENV = "test";
process.env.DATABASE_URL ??= "postgres://calendly:calendly@localhost:5432/calendly_test";
process.env.APP_URL ??= "http://localhost:3000";
process.env.BETTER_AUTH_SECRET ??= "test-secret-test-secret-test-secret";
process.env.SMTP_HOST ??= "localhost";
process.env.SMTP_PORT ??= "1025";
process.env.EMAIL_FROM ??= "Test <test@example.com>";
process.env.TZ = "UTC";
