/** Typed errors thrown by the availability service. Actions catch these and
 * map them to `{ ok: false, error }` results — never let them reach the client
 * as a raw thrown error. */

export class ScheduleNotFoundError extends Error {
  constructor(scheduleId: string) {
    super(`Availability schedule not found: ${scheduleId}`);
    this.name = "ScheduleNotFoundError";
  }
}

export class CannotDeleteDefaultScheduleError extends Error {
  constructor(scheduleId: string) {
    super(`Cannot delete the default availability schedule: ${scheduleId}`);
    this.name = "CannotDeleteDefaultScheduleError";
  }
}

/** Thrown by `getScheduleInputForUser` when the user has no default schedule
 * (and none was passed explicitly) — e.g. onboarding was skipped. */
export class NoScheduleError extends Error {
  constructor(userId: string) {
    super(`User has no availability schedule: ${userId}`);
    this.name = "NoScheduleError";
  }
}
