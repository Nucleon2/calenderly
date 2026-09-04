/**
 * Usernames that must never be assignable because they collide with app
 * routes served at the root (`/{username}` public pages) or are otherwise
 * reserved for the platform itself.
 */
export const RESERVED_USERNAMES: readonly string[] = [
  // App routes (see URL conventions)
  "api",
  "app",
  "admin",
  "dashboard",
  "sign-in",
  "sign-up",
  "signin",
  "signup",
  "login",
  "logout",
  "onboarding",
  "booking",
  "bookings",
  "settings",
  "availability",
  "event-types",
  "health",

  // Next.js / static / infra
  "static",
  "_next",
  "public",
  "assets",
  "favicon.ico",
  "robots.txt",
  "sitemap.xml",

  // Common infra / brand protection
  "www",
  "mail",
  "support",
  "help",
  "about",
  "terms",
  "privacy",
  "calendly",
  "team",
  "teams",
  "org",
  "orgs",
  "me",
  "user",
  "users",
  "embed",
  "widget",

  // Additional obvious reservations
  "root",
  "system",
  "null",
  "undefined",
  "home",
  "docs",
  "blog",
  "pricing",
  "status",
  "security",
  "billing",
  "account",
  "accounts",
  "profile",
  "profiles",
  "auth",
  "oauth",
  "callback",
  "webhook",
  "webhooks",
  "graphql",
  "images",
  "img",
  "cdn",
  "download",
  "downloads",
  "new",
  "edit",
  "delete",
  "create",
  "search",
  "explore",
  "notifications",
  "integrations",
  "connect",
  "connections",
];

const RESERVED_SET = new Set(RESERVED_USERNAMES.map((name) => name.toLowerCase()));

export function isReservedUsername(username: string): boolean {
  return RESERVED_SET.has(username.toLowerCase());
}
