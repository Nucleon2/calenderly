import "server-only";
import { and, eq, ne } from "drizzle-orm";
import { db, type Db, type Tx } from "@/db/client";
import { availabilityRules, availabilitySchedules, user, type User } from "@/db/schema";
import { isReservedUsername } from "@/lib/reserved-usernames";
import { UserNotFoundError, UsernameTakenError } from "./errors";
import type { OnboardingInput, ProfileInput } from "./schema";

export interface PublicProfile {
  id: string;
  name: string;
  username: string;
  image: string | null;
  welcomeText: string | null;
  timezone: string;
}

/** Mon-Fri, 09:00-17:00. */
const DEFAULT_WORKING_HOURS_RULES = [1, 2, 3, 4, 5].map((weekday) => ({
  weekday,
  startMinute: 9 * 60,
  endMinute: 17 * 60,
}));

export async function getUserById(id: string): Promise<User | null> {
  const [row] = await db.select().from(user).where(eq(user.id, id)).limit(1);
  return row ?? null;
}

async function checkUsernameAvailable(
  executor: Db | Tx,
  username: string,
  excludeUserId?: string,
): Promise<boolean> {
  const normalized = username.trim().toLowerCase();
  if (isReservedUsername(normalized)) {
    return false;
  }
  const conditions = excludeUserId
    ? and(eq(user.username, normalized), ne(user.id, excludeUserId))
    : eq(user.username, normalized);
  const [row] = await executor.select({ id: user.id }).from(user).where(conditions).limit(1);
  return !row;
}

/**
 * Whether `username` is free to take. Reserved words are always unavailable.
 * Pass `excludeUserId` when checking a user's own current username (e.g.
 * editing a profile without changing the username should not report itself
 * as taken).
 */
export async function isUsernameAvailable(
  username: string,
  excludeUserId?: string,
): Promise<boolean> {
  return checkUsernameAvailable(db, username, excludeUserId);
}

async function ensureDefaultSchedule(tx: Tx, userId: string, timezone: string): Promise<void> {
  const [existing] = await tx
    .select({ id: user.defaultScheduleId })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);

  if (existing?.id) {
    return;
  }

  const [schedule] = await tx
    .insert(availabilitySchedules)
    .values({ userId, name: "Working hours", timezone, isDefault: true })
    .returning({ id: availabilitySchedules.id });

  if (!schedule) {
    throw new Error("Failed to create default availability schedule");
  }

  await tx.insert(availabilityRules).values(
    DEFAULT_WORKING_HOURS_RULES.map((rule) => ({
      scheduleId: schedule.id,
      weekday: rule.weekday,
      startMinute: rule.startMinute,
      endMinute: rule.endMinute,
    })),
  );

  await tx.update(user).set({ defaultScheduleId: schedule.id }).where(eq(user.id, userId));
}

export async function completeOnboarding(userId: string, input: OnboardingInput): Promise<void> {
  await db.transaction(async (tx) => {
    const [existing] = await tx.select({ id: user.id }).from(user).where(eq(user.id, userId)).limit(1);
    if (!existing) {
      throw new UserNotFoundError(userId);
    }

    const available = await checkUsernameAvailable(tx, input.username, userId);
    if (!available) {
      throw new UsernameTakenError(input.username);
    }

    await tx
      .update(user)
      .set({
        name: input.name,
        username: input.username,
        timezone: input.timezone,
        welcomeText: input.welcomeText || null,
        updatedAt: new Date(),
      })
      .where(eq(user.id, userId));

    await ensureDefaultSchedule(tx, userId, input.timezone);

    await tx
      .update(user)
      .set({ onboardingCompletedAt: new Date(), updatedAt: new Date() })
      .where(eq(user.id, userId));
  });
}

export async function updateProfile(userId: string, input: ProfileInput): Promise<void> {
  await db.transaction(async (tx) => {
    const [existing] = await tx.select({ id: user.id }).from(user).where(eq(user.id, userId)).limit(1);
    if (!existing) {
      throw new UserNotFoundError(userId);
    }

    const available = await checkUsernameAvailable(tx, input.username, userId);
    if (!available) {
      throw new UsernameTakenError(input.username);
    }

    await tx
      .update(user)
      .set({
        name: input.name,
        username: input.username,
        timezone: input.timezone,
        welcomeText: input.welcomeText || null,
        weekStart: input.weekStart,
        image: input.image || null,
        updatedAt: new Date(),
      })
      .where(eq(user.id, userId));
  });
}

export async function getPublicProfileByUsername(username: string): Promise<PublicProfile | null> {
  const [row] = await db
    .select({
      id: user.id,
      name: user.name,
      username: user.username,
      image: user.image,
      welcomeText: user.welcomeText,
      timezone: user.timezone,
    })
    .from(user)
    .where(eq(user.username, username.trim().toLowerCase()))
    .limit(1);

  if (!row || !row.username) {
    return null;
  }

  return { ...row, username: row.username };
}
