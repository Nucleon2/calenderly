import { type CalendarProvider, noopProvider } from "./provider";

/**
 * Resolves the calendar provider for a host. Until M4 lands every user gets the
 * no-op provider; M4 replaces the body with a lookup of `calendar_connections`.
 */
export async function getProviderForUser(userId: string): Promise<CalendarProvider> {
  void userId;
  return noopProvider;
}
