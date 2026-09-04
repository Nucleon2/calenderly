/** Typed errors thrown by the bookings service. Callers (server actions, the
 * pg-boss worker) catch these by type — never let a raw thrown error reach
 * the client. */

export class BookingNotFoundError extends Error {
  constructor(identifier: string) {
    super(`Booking "${identifier}" was not found`);
    this.name = "BookingNotFoundError";
  }
}

/** Also thrown when Postgres rejects an insert with the `bookings_no_overlap`
 * EXCLUDE constraint (error code 23P01). */
export class SlotUnavailableError extends Error {
  constructor(message = "The selected time is no longer available") {
    super(message);
    this.name = "SlotUnavailableError";
  }
}

/** e.g. cancelling an already-cancelled booking, or rescheduling one that
 * isn't currently confirmed. */
export class InvalidBookingStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidBookingStateError";
  }
}

export class BookingValidationError extends Error {
  field?: string;

  constructor(message: string, field?: string) {
    super(message);
    this.name = "BookingValidationError";
    this.field = field;
  }
}

/** Event type is inactive, or doesn't exist. */
export class EventTypeUnavailableError extends Error {
  constructor(eventTypeId: string) {
    super(`Event type "${eventTypeId}" is not available for booking`);
    this.name = "EventTypeUnavailableError";
  }
}
