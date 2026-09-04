export class EventTypeNotFoundError extends Error {
  constructor(id: string) {
    super(`Event type "${id}" was not found`);
    this.name = "EventTypeNotFoundError";
  }
}

export class SlugTakenError extends Error {
  constructor(slug: string) {
    super(`Slug "${slug}" is already taken`);
    this.name = "SlugTakenError";
  }
}

export class EventTypeHasBookingsError extends Error {
  constructor(id: string) {
    super(`Event type "${id}" has bookings and cannot be deleted`);
    this.name = "EventTypeHasBookingsError";
  }
}
